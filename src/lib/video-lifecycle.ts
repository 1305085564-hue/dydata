import { requireAdminActor, type AdminActor } from "@/app/api/admin/auth-helper";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VideoLifecycleState } from "@/types";

export type VideoLifecycleAction = "trash" | "restore" | "purge";

type LifecycleVideoRow = {
  id: string;
  user_id: string;
  lifecycle_state: VideoLifecycleState;
  trashed_at: string | null;
  accounts: { profile_id: string | null } | Array<{ profile_id: string | null }> | null;
};

type SnapshotPathRow = {
  screenshot_urls: string[] | null;
  curve_screenshot_url: string | null;
  retention_screenshot_url: string | null;
};

export type VideoLifecycleResult =
  | { ok: true; lifecycleState: VideoLifecycleState; trashedAt: string | null; purgedAt: string | null; screenshotCleanupFailed: boolean }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409; error: string };

function firstAccount(value: LifecycleVideoRow["accounts"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function canOperateVideoLifecycle(actor: Pick<AdminActor, "businessRole">, action: VideoLifecycleAction) {
  if (actor.businessRole === "owner") return true;
  return action !== "purge" && actor.businessRole === "team_admin";
}

export function canOperateVideoWithinScope(
  actor: Pick<AdminActor, "businessRole">,
  scope: Pick<DataAccessScope, "visibleUserIds">,
  ownerUserId: string,
) {
  return actor.businessRole === "owner" || scope.visibleUserIds.includes(ownerUserId);
}

export function isPurgeEligible(trashedAt: string | null, now = new Date()) {
  if (!trashedAt) return false;
  const timestamp = new Date(trashedAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime() - 30 * 24 * 60 * 60 * 1000;
}

export function extractSubmissionScreenshotPaths(values: Array<string | null | undefined>, ownerUserId: string) {
  const prefix = `${ownerUserId}/`;
  return Array.from(new Set(values.flatMap((value) => {
    if (!value) return [];
    try {
      const url = new URL(value, "https://dydata.cc");
      if (url.pathname !== "/api/submission-screenshots/file") return [];
      const path = url.searchParams.get("path") ?? "";
      const parts = path.split("/");
      const safePath = path.length <= 1024 && !path.startsWith("/") && !path.includes("\\")
        && parts.length >= 2 && parts.every((part) => Boolean(part) && part !== "." && part !== "..");
      return path.startsWith(prefix) && safePath ? [path] : [];
    } catch {
      return [];
    }
  })));
}

export async function performVideoLifecycleAction(
  input: { videoId: string; action: VideoLifecycleAction; now?: Date },
  deps: {
    requireAdminActor: typeof requireAdminActor;
    createAdminClient: typeof createAdminClient;
    buildDataAccessScope: typeof buildDataAccessScope;
  } = { requireAdminActor, createAdminClient, buildDataAccessScope },
): Promise<VideoLifecycleResult> {
  const auth = await deps.requireAdminActor();
  if ("error" in auth) return { ok: false, status: auth.status, error: auth.error };
  if (!canOperateVideoLifecycle(auth.actor, input.action)) {
    return { ok: false, status: 403, error: "无回收站操作权限" };
  }

  const supabase = deps.createAdminClient();
  const scope = await deps.buildDataAccessScope(supabase, auth.actor.userId);
  if (!scope) return { ok: false, status: 403, error: "用户权限范围加载失败" };

  const { data, error } = await supabase
    .from("videos")
    .select("id, user_id, lifecycle_state, trashed_at, accounts(profile_id)")
    .eq("id", input.videoId)
    .maybeSingle();
  if (error) return { ok: false, status: 404, error: "作品不存在" };
  if (!data) return { ok: false, status: 404, error: "作品不存在" };

  const video = data as LifecycleVideoRow;
  const ownerUserId = firstAccount(video.accounts)?.profile_id ?? video.user_id;
  if (!canOperateVideoWithinScope(auth.actor, scope, ownerUserId)) {
    return { ok: false, status: 403, error: "无权处理该作品" };
  }
  if (input.action === "trash" && video.lifecycle_state !== "active") {
    return { ok: false, status: 409, error: "作品当前不能移入回收站" };
  }
  if (input.action === "restore" && video.lifecycle_state !== "trashed") {
    return { ok: false, status: 409, error: "作品当前不能恢复" };
  }
  if (input.action === "purge") {
    if (video.lifecycle_state !== "trashed" && video.lifecycle_state !== "purged") return { ok: false, status: 409, error: "作品尚未在回收站中" };
    if (video.lifecycle_state === "trashed" && !isPurgeEligible(video.trashed_at, input.now)) {
      return { ok: false, status: 409, error: "作品移入回收站未满30天" };
    }
  }

  let screenshotPaths: string[] = [];
  if (input.action === "purge") {
    const { data: snapshots } = await supabase
      .from("video_metrics_snapshots")
      .select("screenshot_urls, curve_screenshot_url, retention_screenshot_url")
      .eq("video_id", video.id);
    screenshotPaths = extractSubmissionScreenshotPaths(
      (snapshots ?? []).flatMap((row) => [
        ...((row as SnapshotPathRow).screenshot_urls ?? []),
        (row as SnapshotPathRow).curve_screenshot_url,
        (row as SnapshotPathRow).retention_screenshot_url,
      ]),
      ownerUserId,
    );
  }

  const retryingPurgedCleanup = input.action === "purge" && video.lifecycle_state === "purged";
  const transition = retryingPurgedCleanup
    ? { data: [{ lifecycle_state: "purged" as const, trashed_at: video.trashed_at, purged_at: null }], error: null }
    : await supabase.rpc("transition_video_lifecycle", {
        p_video_id: video.id,
        p_action: input.action,
        p_actor_id: auth.actor.userId,
      });
  if (transition.error) return { ok: false, status: 409, error: "作品状态已变化，请刷新后重试" };
  const row = (transition.data ?? [])[0] as { lifecycle_state: VideoLifecycleState; trashed_at: string | null; purged_at: string | null } | undefined;
  if (!row) return { ok: false, status: 409, error: "作品状态已变化，请刷新后重试" };

  let screenshotCleanupFailed = false;
  if (input.action === "purge" && screenshotPaths.length > 0) {
    const { error: storageError } = await supabase.storage.from("submission-screenshots").remove(screenshotPaths);
    screenshotCleanupFailed = Boolean(storageError);
  }
  return { ok: true, lifecycleState: row.lifecycle_state, trashedAt: row.trashed_at, purgedAt: row.purged_at, screenshotCleanupFailed };
}
