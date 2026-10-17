import { createAdminClient } from "@/lib/supabase/admin";

import { getConfiguredDouyinClient } from "./server";
import { decryptDouyinSecret, encryptDouyinSecret } from "./secrets";
import { getDouyinConfig } from "./config";
import { getDouyinSnapshotType, classifyDouyinVideoMatch, mergeDouyinUserMetricRows, type DouyinExistingVideo } from "./reconciliation";
import type { DouyinVideoData, DouyinVideoListItem } from "./contracts";

type AdminClient = ReturnType<typeof createAdminClient>;

export type DouyinSyncSummary = {
  syncRunId: string;
  bindingId: string;
  discoveredCount: number;
  matchedCount: number;
  pendingCount: number;
  failedCount: number;
  accountMetricDays: number;
};

export async function runDouyinSync(
  bindingId: string,
  triggerType: "cron" | "manual" | "retry",
  admin = createAdminClient(),
): Promise<DouyinSyncSummary> {
  const bindingResult = await admin
    .from("douyin_account_bindings")
    .select("id, account_id, platform_account_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, refresh_token_expires_at, status")
    .eq("id", bindingId)
    .maybeSingle();
  if (bindingResult.error) throw bindingResult.error;
  if (!bindingResult.data) throw new Error("DOUYIN_BINDING_NOT_FOUND");
  if (["revoked", "expired"].includes(bindingResult.data.status)) throw new Error("DOUYIN_BINDING_INACTIVE");

  const activeRun = await admin
    .from("douyin_sync_runs")
    .select("id, status")
    .eq("binding_id", bindingId)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (activeRun.error) throw activeRun.error;
  if (activeRun.data) return {
    syncRunId: activeRun.data.id,
    bindingId,
    discoveredCount: 0,
    matchedCount: 0,
    pendingCount: 0,
    failedCount: 0,
    accountMetricDays: 0,
  };

  const run = await admin
    .from("douyin_sync_runs")
    .insert({ binding_id: bindingId, trigger_type: triggerType, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (run.error || !run.data) throw run.error ?? new Error("DOUYIN_SYNC_RUN_CREATE_FAILED");

  try {
    const { accessToken, binding } = await ensureAccessToken(admin, bindingResult.data);
    const { client } = getConfiguredDouyinClient();
    const [videos, metrics] = await Promise.all([
      client.listVideos({ accessToken, openId: binding.platform_account_id }),
      client.getUserMetrics({ accessToken, openId: binding.platform_account_id, dateType: 30 }),
    ]);

    const account = await admin.from("accounts").select("id, profile_id").eq("id", binding.account_id).single();
    if (account.error || !account.data) throw account.error ?? new Error("DOUYIN_ACCOUNT_NOT_FOUND");
    const profile = await admin.from("profiles").select("id, name").eq("id", account.data.profile_id).single();
    if (profile.error || !profile.data) throw profile.error ?? new Error("DOUYIN_PROFILE_NOT_FOUND");

    const existing = await admin
      .from("videos")
      .select("id, account_id, douyin_item_id, video_title, published_at")
      .eq("account_id", account.data.id)
      .eq("lifecycle_state", "active");
    if (existing.error) throw existing.error;
    const existingVideos = (existing.data ?? []).map((row) => ({
      id: row.id,
      accountId: row.account_id,
      douyinItemId: row.douyin_item_id ?? null,
      title: row.video_title ?? null,
      publishedAt: row.published_at ?? null,
    })) satisfies DouyinExistingVideo[];
    const dataByItem = new Map<string, DouyinVideoData>(
      (await client.getVideoData({ accessToken, openId: binding.platform_account_id, itemIds: videos.map((video) => video.platformVideoId) }))
        .map((row) => [row.platformVideoId, row]),
    );

    let matchedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    for (const video of videos) {
      try {
        const external = await upsertExternalVideo(admin, binding.id, run.data.id, video);
        const match = classifyDouyinVideoMatch({
          accountId: account.data.id,
          platformVideoId: video.platformVideoId,
          title: video.title,
          platformPublishedAt: video.createdAt,
          existingVideos,
        });
        let videoId = match.videoId;
        if (!videoId && match.status === "discovered" && video.createdAt) {
          videoId = await createAutomaticVideo(admin, {
            accountId: account.data.id,
            profileId: profile.data.id,
            item: video,
          });
          existingVideos.push({ id: videoId, accountId: account.data.id, douyinItemId: video.platformVideoId, title: video.title, publishedAt: video.createdAt });
        }
        const status = videoId ? "matched" : match.status;
        await admin.from("douyin_external_videos").update({ matched_video_id: videoId, reconciliation_status: status }).eq("id", external.id);
        if (videoId) {
          matchedCount += 1;
          await persistVideoMetric(admin, videoId, video.createdAt, dataByItem.get(video.platformVideoId));
        } else {
          pendingCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    const mergedMetrics = mergeDouyinUserMetricRows(metrics);
    if (mergedMetrics.length > 0) {
      const upsertMetrics = await admin.from("douyin_account_metrics").upsert(
        mergedMetrics.map((row) => ({ binding_id: binding.id, metric_date: row.metricDate, new_fans: row.newFans, total_fans: row.totalFans, new_likes: row.newLikes, new_play: row.newPlay, profile_uv: row.profileUv, new_issue: row.newIssue, total_issue: row.totalIssue, source: "douyin" })),
        { onConflict: "binding_id,metric_date" },
      );
      if (upsertMetrics.error) throw upsertMetrics.error;
    }

    await admin.from("douyin_account_bindings").update({ last_sync_at: new Date().toISOString(), status: failedCount > 0 ? "error" : "active", last_error_code: failedCount > 0 ? "PARTIAL_SYNC" : null, last_error_summary: failedCount > 0 ? `${failedCount} 条作品同步失败` : null, consecutive_failures: failedCount > 0 ? 1 : 0 }).eq("id", bindingId);
    await admin.from("douyin_sync_runs").update({ status: failedCount > 0 ? "partial" : "succeeded", discovered_count: videos.length, matched_count: matchedCount, pending_count: pendingCount, failed_count: failedCount, finished_at: new Date().toISOString() }).eq("id", run.data.id);
    return { syncRunId: run.data.id, bindingId, discoveredCount: videos.length, matchedCount, pendingCount, failedCount, accountMetricDays: mergedMetrics.length };
  } catch (error) {
    await admin.from("douyin_sync_runs").update({ status: "failed", failed_count: 1, error_code: error instanceof Error ? error.message.split(":")[0] : "DOUYIN_SYNC_FAILED", error_summary: "抖音同步失败", finished_at: new Date().toISOString() }).eq("id", run.data.id);
    await admin.from("douyin_account_bindings").update({ status: "error", last_error_code: "SYNC_FAILED", last_error_summary: "抖音同步失败", consecutive_failures: 1 }).eq("id", bindingId);
    throw error;
  }
}

async function ensureAccessToken(admin: AdminClient, binding: { id: string; account_id: string; platform_account_id: string; access_token_ciphertext: string; refresh_token_ciphertext: string; access_token_expires_at: string; refresh_token_expires_at: string }) {
  const config = getDouyinConfig();
  if (Date.parse(binding.access_token_expires_at) > Date.now() + 120_000) {
    return { accessToken: decryptDouyinSecret(binding.access_token_ciphertext, config.tokenEncryptionKey), binding };
  }
  if (Date.parse(binding.refresh_token_expires_at) <= Date.now()) throw new Error("DOUYIN_REFRESH_TOKEN_EXPIRED");
  const refreshToken = decryptDouyinSecret(binding.refresh_token_ciphertext, config.tokenEncryptionKey);
  const { client } = getConfiguredDouyinClient();
  const next = await client.refreshAccessToken(refreshToken);
  const update = await admin.from("douyin_account_bindings").update({ access_token_ciphertext: encryptDouyinSecret(next.accessToken, config.tokenEncryptionKey), refresh_token_ciphertext: encryptDouyinSecret(next.refreshToken, config.tokenEncryptionKey), access_token_expires_at: new Date(Date.now() + next.expiresInSeconds * 1000).toISOString(), refresh_token_expires_at: new Date(Date.now() + next.refreshExpiresInSeconds * 1000).toISOString(), scopes: next.scopes, status: "active" }).eq("id", binding.id);
  if (update.error) throw update.error;
  return { accessToken: next.accessToken, binding: { ...binding, platform_account_id: next.openId } };
}

async function upsertExternalVideo(admin: AdminClient, bindingId: string, syncRunId: string, video: DouyinVideoListItem) {
  const result = await admin.from("douyin_external_videos").upsert({ binding_id: bindingId, sync_run_id: syncRunId, platform_video_id: video.platformVideoId, title: video.title, share_url: video.shareUrl, platform_published_at: video.createdAt, last_seen_at: new Date().toISOString() }, { onConflict: "binding_id,platform_video_id" }).select("id").single();
  if (result.error || !result.data) throw result.error ?? new Error("DOUYIN_EXTERNAL_VIDEO_WRITE_FAILED");
  return result.data;
}

async function createAutomaticVideo(admin: AdminClient, input: { accountId: string; profileId: string; item: DouyinVideoListItem }) {
  const result = await admin.from("videos").insert({ account_id: input.accountId, user_id: input.profileId, douyin_item_id: input.item.platformVideoId, video_url: input.item.shareUrl, video_title: input.item.title ?? "抖音作品", published_at: input.item.createdAt, uploaded_at: new Date().toISOString() }).select("id").single();
  if (!result.error && result.data) return result.data.id;
  if (result.error?.code === "23505") {
    const existing = await admin.from("videos").select("id").eq("account_id", input.accountId).eq("douyin_item_id", input.item.platformVideoId).maybeSingle();
    if (existing.error || !existing.data) throw existing.error ?? new Error("DOUYIN_VIDEO_CONFLICT");
    return existing.data.id;
  }
  throw result.error ?? new Error("DOUYIN_VIDEO_CREATE_FAILED");
}

async function persistVideoMetric(admin: AdminClient, videoId: string, publishedAt: string | null, metric: DouyinVideoData | undefined) {
  if (!metric) return;
  const snapshotType = getDouyinSnapshotType(publishedAt, new Date().toISOString());
  if (!snapshotType) return;
  const existing = await admin.from("video_metrics_snapshots").select("id").eq("video_id", videoId).eq("snapshot_type", snapshotType).maybeSingle();
  const payload = { play_count: metric.playCount, likes: metric.likes, comments: metric.comments, shares: metric.shares, favorites: metric.favorites, captured_at: new Date().toISOString() };
  if (existing.error) throw existing.error;
  if (existing.data) {
    const update = await admin.from("video_metrics_snapshots").update(payload).eq("id", existing.data.id);
    if (update.error) throw update.error;
  } else {
    const insert = await admin.from("video_metrics_snapshots").insert({ video_id: videoId, snapshot_type: snapshotType, ...payload });
    if (insert.error) throw insert.error;
  }

  const report = await admin.from("daily_reports").select("id, data_source").eq("video_id", videoId).eq("is_void", false).maybeSingle();
  if (report.error) throw report.error;
  if (report.data && report.data.data_source !== "manual") {
    const reportPatch = {
      ...(metric.playCount === null ? {} : { play_count: metric.playCount }),
      ...(metric.likes === null ? {} : { likes: metric.likes }),
      ...(metric.comments === null ? {} : { comments: metric.comments }),
      ...(metric.shares === null ? {} : { shares: metric.shares }),
      ...(metric.favorites === null ? {} : { favorites: metric.favorites }),
      data_source: "douyin",
    };
    const updateReport = await admin.from("daily_reports").update(reportPatch).eq("id", report.data.id);
    if (updateReport.error) throw updateReport.error;
  }
}
