import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAiJson } from "@/lib/ai/client";
import { normalizeAiTagSuggestions, type RawAiTagSuggestion } from "@/lib/video-tags";
import { replaceDailyReportUsageRecord } from "@/lib/conversion-hub/service";
import { buildManualTagPayload, dedupeTagPayloads } from "./tag-payload";
import { resolveSubmissionRoleUserIds, validateVideoSubmitPayload } from "./validation";
import { buildSubmissionRecordId } from "./stability";
import { resolveSubmissionVideoWriteMode } from "./submission-video-lifecycle";
import {
  buildEditSubmissionContract,
  getExistingScreenshotUrls,
  hasReusableConfirmedScreenshots,
  mergeReusableScreenshotFields,
  resolveEditTopicId,
  type EditSubmissionContract,
  type ExistingSubmissionScreenshotFields,
} from "./edit-detail";
import {
  collectUnchangedOriginalAssigneeIds,
  EDIT_BINDING_REPORT_SELECT,
  EDIT_BINDING_SNAPSHOT_SELECT,
  EDIT_BINDING_VIDEO_SELECT,
  mergePreservedEditSnapshotFields,
  validateEditSubmissionBinding,
} from "./edit-binding";
import { getOwnedSubmissionScreenshotPaths } from "@/lib/submission-screenshot-access";
import { filterActiveMemberships, isMissingMembershipStatusError, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import {
  DAILY_REPORT_WRITE_SELECT,
  SNAPSHOT_WRITE_SELECT,
  VIDEO_SUBMIT_RESPONSE_SELECT,
} from "./response-fields";

type RollbackAction = () => Promise<void>;

function stripId<T extends Record<string, unknown>>(row: T) {
  const rest = { ...row };
  delete rest.id;
  return rest;
}

function buildTagPrompt(content: string) {
  return [
    "你是抖音视频标签助手。",
    "请根据视频文案，为该视频选择 3 个标签维度。",
    "只能从给定枚举中选择，不允许自由发挥，不允许新增标签。",
    "返回 JSON，对象结构固定为 { \"tags\": [...] }。",
    "每个标签对象都必须包含 tag_dimension、tag_value、confidence、reason。",
    "confidence 为 0 到 1 的数字。",
    "可选维度与枚举：",
    "1. 题材：大盘复盘 / 板块机会 / 个股拆解 / 情绪周期 / 战法教学 / 风险提醒 / 热点追踪 / 盘前预判",
    "2. 表达形式：结论先行 / 问答式 / 清单式 / 案例拆解 / 情绪点评 / 故事引入 / 观点输出",
    "3. CTA类型：关注 / 评论 / 私信 / 看主页 / 进群 / 无明显CTA",
    "必须且仅返回这 3 个维度，每个维度只返回 1 个标签。",
    "只返回 JSON，不要 markdown，不要额外解释。",
    "示例：",
    JSON.stringify({
      tags: [
        { tag_dimension: "题材", tag_value: "大盘复盘", confidence: 0.92, reason: "围绕指数走势与盘面总结展开" },
        { tag_dimension: "表达形式", tag_value: "结论先行", confidence: 0.83, reason: "开头先给出核心观点" },
        { tag_dimension: "CTA类型", tag_value: "无明显CTA", confidence: 0.71, reason: "文案中未见明确引导动作" },
      ],
    }),
    "视频文案：",
    content,
  ].join("\n");
}

async function generateAiTags(content: string) {
  try {
    const result = await callAiJson(buildTagPrompt(content), { maxTokens: 1200, timeoutMs: 12000, featureKey: "video_tag" });
    const jsonText = extractJsonFromContent(result.content);
    if (!jsonText) return [];
    const parsed = JSON.parse(jsonText) as { tags?: RawAiTagSuggestion[] };
    return normalizeAiTagSuggestions(Array.isArray(parsed.tags) ? parsed.tags : []);
  } catch {
    return [];
  }
}

function extractJsonFromContent(content: string): string | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1);
}

export async function rollbackSafely(actions: RollbackAction[]) {
  const errors: Error[] = [];
  for (const action of [...actions].reverse()) {
    try {
      await action();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error("回滚失败"));
    }
  }
  if (!errors.length) return null;

  return new Error(`提交失败后的回滚未完成：${errors.map((error) => error.message).join("；")}`);
}

export function assertVideoSubmissionRollbackResult(data: unknown, error: { message?: string } | null) {
  if (error || (data !== "deleted" && data !== "trashed")) {
    throw new Error(error?.message || "视频回滚未完成");
  }
}

async function rollbackNewVideoSubmission(videoId: string, userId: string) {
  const { data, error } = await createAdminClient().rpc("rollback_new_video_submission", {
    p_video_id: videoId,
    p_user_id: userId,
  });
  assertVideoSubmissionRollbackResult(data, error);
}

async function restoreVideoSubmission(videoId: string, userId: string) {
  const { data, error } = await createAdminClient().rpc("transition_video_lifecycle", {
    p_video_id: videoId,
    p_action: "restore",
    p_actor_id: userId,
  });
  const restored = Array.isArray(data) ? data[0] : null;
  if (error || restored?.lifecycle_state !== "active") {
    throw new Error(error?.message || "视频记录恢复失败");
  }
}

type ScreenshotAccessResult =
  | { ok: true; paths: string[] }
  | { ok: false; status: 400 | 403; error: string };

async function assertReadableSubmissionScreenshots(
  userId: string,
  urls: string[],
  expectedOrigin: string,
): Promise<ScreenshotAccessResult> {
  const paths = getOwnedSubmissionScreenshotPaths(userId, urls, expectedOrigin);
  if (!paths) {
    return { ok: false, status: 403, error: "截图不存在或不属于当前用户，请重新上传" };
  }

  if (!paths.length) return { ok: true, paths };

  const { data: signedScreenshots, error: signedScreenshotsError } = await createAdminClient().storage
    .from("submission-screenshots")
    .createSignedUrls(paths, 60);
  if (
    signedScreenshotsError ||
    !signedScreenshots ||
    signedScreenshots.length !== paths.length ||
    signedScreenshots.some((item) => item.error || !item.signedUrl)
  ) {
    return { ok: false, status: 400, error: "截图不存在或无法读取，请重新上传" };
  }

  return { ok: true, paths };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const validationResult = validateVideoSubmitPayload(body);
  if (!validationResult.ok) {
    return NextResponse.json({ error: validationResult.error }, { status: 400 });
  }

  const normalized = validationResult.normalized;

  let editContract: EditSubmissionContract | null = null;
  if (normalized.mode === "edit") {
    const editContractResult = buildEditSubmissionContract(body);
    if (!editContractResult.ok) {
      return NextResponse.json({ error: editContractResult.error }, { status: 400 });
    }
    editContract = editContractResult.dto;
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, profile_id, name")
    .eq("id", normalized.account_id)
    .single();

  if (accountError || !account || account.profile_id !== user.id) {
    return NextResponse.json({ error: "账号不存在或无权限提交" }, { status: 403 });
  }

  // 编辑模式独立安全边界：在任何写入前重新核对原视频、日期、日报与快照绑定
  const editBinding = editContract
    ? await validateEditSubmissionBinding(
        {
          userId: user.id,
          accountId: normalized.account_id,
          bizDate: normalized.biz_date,
          videoId: editContract.video_id,
        },
        {
          loadVideoById: async (videoId) => {
            const { data, error } = await supabase
              .from("videos")
              .select(EDIT_BINDING_VIDEO_SELECT)
              .eq("id", videoId)
              .limit(2);
            return { data: (data ?? null) as never, error };
          },
          loadDailyReportsByAccountAndDate: async (accountId, bizDate) => {
            const { data, error } = await supabase
              .from("daily_reports")
              .select(EDIT_BINDING_REPORT_SELECT)
              .eq("account_id", accountId)
              .eq("report_date", bizDate)
              .limit(2);
            return { data: (data ?? null) as never, error };
          },
          load24hSnapshotsByVideoId: async (videoId) => {
            const { data, error } = await supabase
              .from("video_metrics_snapshots")
              .select(EDIT_BINDING_SNAPSHOT_SELECT)
              .eq("video_id", videoId)
              .eq("snapshot_type", "24h")
              .limit(2);
            return { data: (data ?? null) as never, error };
          },
        },
      )
    : null;
  if (editBinding && !editBinding.ok) {
    return NextResponse.json({ error: editBinding.error }, { status: editBinding.status });
  }

  const screenshotAccess = await assertReadableSubmissionScreenshots(
    user.id,
    normalized.assets.map((asset) => asset.url),
    request.nextUrl.origin,
  );
  if (!screenshotAccess.ok) {
    return NextResponse.json({ error: screenshotAccess.error }, { status: screenshotAccess.status });
  }

  const profileResult = await supabase
    .from("profiles")
    .select("name, team_id, membership_status")
    .eq("id", user.id)
    .single();
  const fallbackProfileResult = profileResult.error && isMissingMembershipStatusError(profileResult.error)
    ? await supabase
      .from("profiles")
      .select("name, team_id")
      .eq("id", user.id)
      .single()
    : null;
  const profile = (fallbackProfileResult?.data ?? profileResult.data) as {
    name: string | null;
    team_id: string | null;
    membership_status?: string | null;
  } | null;
  const profileError = fallbackProfileResult?.error ?? profileResult.error;

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (profile?.membership_status === "archived") {
    return NextResponse.json({ error: "已归档账号不能提交视频" }, { status: 403 });
  }

  const submitter = profile?.name ?? "未知";
  const roleUserIds = editContract
    ? {
        scriptAuthorUserId: editContract.assignees.script_author_user_id,
        videoEditorUserId: editContract.assignees.video_editor_user_id,
        operatorUserId: editContract.assignees.operator_user_id,
      }
    : resolveSubmissionRoleUserIds(normalized, user.id);
  const externalAssigneeIds = [...new Set(
    Object.values(roleUserIds).filter((id): id is string => typeof id === "string" && id !== user.id),
  )].filter((id) => {
    // 编辑时未修改的旧责任人保留原值，即使已归档/离队也放行
    if (editBinding && editBinding.ok) {
      const unchanged = collectUnchangedOriginalAssigneeIds(roleUserIds, {
        scriptAuthorUserId: editBinding.video.script_author_user_id,
        videoEditorUserId: editBinding.video.video_editor_user_id,
        operatorUserId: editBinding.video.operator_user_id,
      });
      if (unchanged.has(id)) return false;
    }
    return true;
  });

  if (externalAssigneeIds.length) {
    const assigneeProfilesResult = await loadWithMembershipFallback({
      loadWithMembership: async () => createAdminClient()
        .from("profiles")
        .select("id, team_id, membership_status")
        .in("id", externalAssigneeIds),
      loadWithoutMembership: async () => createAdminClient()
        .from("profiles")
        .select("id, team_id")
        .in("id", externalAssigneeIds),
    });
    const assigneeProfiles = filterActiveMemberships(
      (assigneeProfilesResult.data ?? []) as Array<{ id: string; team_id: string | null; membership_status?: string | null }>,
    );

    const validAssigneeIds = new Set(
      assigneeProfiles
        .filter((assignee) => {
          return profile?.team_id ? assignee.team_id === profile.team_id : false;
        })
        .map((assignee) => assignee.id),
    );
    if (assigneeProfilesResult.error || externalAssigneeIds.some((id) => !validAssigneeIds.has(id))) {
      return NextResponse.json({ error: "责任人必须是当前团队或小组中的在职成员" }, { status: 403 });
    }
  }

  const submissionVideoId = buildSubmissionRecordId(normalized);
  const nowIso = new Date().toISOString();
  const rollbackActions: RollbackAction[] = [];

  const videoPayload = {
    id: submissionVideoId,
    account_id: normalized.account_id,
    user_id: user.id,
    video_url: normalized.video_url,
    video_title: normalized.video_title,
    content: normalized.content,
    published_at: normalized.published_at,
    uploaded_at: nowIso,
    anomaly_status: normalized.anomaly_status,
    punish_type: normalized.punish_type,
    platform_notice: normalized.platform_notice,
    appeal: normalized.appeal,
    topic_id: normalized.topic_id,
    script_author_user_id: roleUserIds.scriptAuthorUserId,
    video_editor_user_id: roleUserIds.videoEditorUserId,
    operator_user_id: roleUserIds.operatorUserId,
  };

  const adminSupabase = createAdminClient();
  let existingVideo: Record<string, unknown> & {
    id: string;
    account_id: string;
    user_id: string;
    topic_id?: string | null;
    lifecycle_state?: string | null;
    script_author_user_id?: string | null;
    video_editor_user_id?: string | null;
    operator_user_id?: string | null;
  } | null = null;

  if (editBinding && editBinding.ok) {
    // 编辑模式：绑定校验已确认归属与日期，直接复用校验读取到的原视频
    existingVideo = editBinding.video;
  } else {
    const { data: fetchedVideo, error: existingVideoError } = await adminSupabase
      .from("videos")
      .select("id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, punish_type, platform_notice, appeal, topic_id, script_author_user_id, video_editor_user_id, operator_user_id, lifecycle_state, created_at")
      .eq("id", submissionVideoId)
      .maybeSingle();

    if (existingVideoError) {
      return NextResponse.json({ error: existingVideoError.message }, { status: 500 });
    }

    if (fetchedVideo && fetchedVideo.user_id !== user.id) {
      return NextResponse.json({ error: "视频记录已被其他成员占用" }, { status: 409 });
    }
    existingVideo = fetchedVideo;
  }

  if (normalized.mode === "edit" && !existingVideo) {
    return NextResponse.json({ error: "原视频不存在或无权限编辑" }, { status: 404 });
  }

  if (normalized.mode === "edit" && existingVideo && existingVideo.account_id !== normalized.account_id) {
    return NextResponse.json({ error: "编辑视频与提交账号不一致" }, { status: 409 });
  }

  const videoWriteMode = resolveSubmissionVideoWriteMode(existingVideo?.lifecycle_state ?? null);
  if (existingVideo && videoWriteMode === "insert") {
    return NextResponse.json({ error: "视频记录已永久删除，请修改内容后重新提交" }, { status: 409 });
  }

  if (videoWriteMode === "restore_then_update") {
    try {
      await restoreVideoSubmission(submissionVideoId, user.id);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "视频记录恢复失败" }, { status: 500 });
    }
  }

  if (existingVideo) {
    rollbackActions.push(async () => {
      const { error } = await adminSupabase.from("videos").update(stripId(existingVideo)).eq("id", existingVideo.id);
      if (error) throw error;
    });
  } else {
    rollbackActions.push(async () => {
      await rollbackNewVideoSubmission(submissionVideoId, user.id);
    });
  }

  const { data: persistedVideo, error: videoError } = existingVideo
    ? await supabase
      .from("videos")
      .update(stripId({
        ...videoPayload,
        topic_id: resolveEditTopicId(normalized.mode, normalized.topic_id, existingVideo.topic_id ?? null),
      }))
      .eq("id", submissionVideoId)
      .select(VIDEO_SUBMIT_RESPONSE_SELECT)
      .single()
    : await supabase.from("videos").insert(videoPayload).select(VIDEO_SUBMIT_RESPONSE_SELECT).single();

  if (videoError || !persistedVideo) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: videoError?.message || "视频记录创建失败" }, { status: 500 });
  }

  const screenshotUrls = normalized.assets.map((asset) => asset.url);
  const ocrSummary = normalized.assets.reduce<Record<string, unknown>>((acc, asset) => {
    const fields = asset.recognized_fields;
    if (fields) {
      acc[asset.role] = fields;
    }
    return acc;
  }, {});
  const ocrAssets = normalized.assets.map((asset) => ({
    role: asset.role,
    screenshot_type: asset.screenshot_type ?? null,
    confidence_score: asset.confidence_score ?? null,
    confirmed: Boolean(asset.confirmed),
    recognized_fields: asset.recognized_fields ?? null,
  }));

  // 留存截图固定由 screenshot_2 槽位写入；curve 截图识别已下线，不再写入新值（历史数据保留）
  const retentionScreenshotUrl = normalized.assets.find((asset) => asset.role === "screenshot_2")?.url ?? null;

  const snapshotPayload = {
    video_id: persistedVideo.id,
    snapshot_type: "24h",
    play_count: normalized.metrics.play_count,
    likes: normalized.metrics.likes,
    comments: normalized.metrics.comments,
    shares: normalized.metrics.shares,
    favorites: normalized.metrics.favorites,
    follower_gain: normalized.metrics.follower_gain,
    follower_loss: normalized.metrics.follower_loss,
    follower_convert: normalized.metrics.follower_convert,
    homepage_visits: 0,
    fan_play_ratio: null,
    cover_click_rate: null,
    avg_play_duration: normalized.metrics.avg_play_duration,
    completion_rate: normalized.metrics.completion_rate,
    bounce_rate_2s: normalized.metrics.bounce_rate_2s,
    completion_rate_5s: normalized.metrics.completion_rate_5s,
    avg_play_ratio: null,
    vs_previous: normalized.published_at_text || Object.keys(ocrSummary).length || ocrAssets.length
      ? {
          published_at_text: normalized.published_at_text ?? null,
          ocr_summary: Object.keys(ocrSummary).length ? ocrSummary : null,
          ocr_assets: ocrAssets.length ? ocrAssets : null,
        }
      : null,
    screenshot_urls: screenshotUrls.length ? screenshotUrls : null,
    retention_screenshot_url: retentionScreenshotUrl,
  };

  const { data: queriedSnapshot, error: existingSnapshotError } = editBinding && editBinding.ok
    ? { data: editBinding.snapshot24h, error: null }
    : await supabase
      .from("video_metrics_snapshots")
      .select(
        "id, video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, fan_play_ratio, homepage_visits, follower_convert, cover_click_rate, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, avg_play_ratio, vs_previous, screenshot_urls, curve_screenshot_url, retention_screenshot_url, captured_at"
      )
      .eq("video_id", persistedVideo.id)
      .eq("snapshot_type", "24h")
      .maybeSingle();

  if (existingSnapshotError) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: existingSnapshotError.message }, { status: 500 });
  }

  // 编辑模式由服务端保留数据库中不可编辑指标的原值，不信任前端默认值
  const preservedSnapshotPayload = mergePreservedEditSnapshotFields(
    normalized.mode,
    snapshotPayload,
    editBinding && editBinding.ok ? editBinding.snapshot24h : null,
  );

  const existingScreenshotFields = queriedSnapshot as ExistingSubmissionScreenshotFields | null;
  const reusableScreenshotFields = mergeReusableScreenshotFields(
    normalized.mode,
    normalized.assets,
    existingScreenshotFields,
  );

  if (normalized.mode === "edit" && normalized.assets.length === 0) {
    const existingScreenshotAccess = await assertReadableSubmissionScreenshots(
      user.id,
      getExistingScreenshotUrls(existingScreenshotFields),
      request.nextUrl.origin,
    );
    if (!existingScreenshotAccess.ok) {
      { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
      return NextResponse.json({ error: existingScreenshotAccess.error }, { status: existingScreenshotAccess.status });
    }

    if (normalized.anomaly_status === "normal" && !hasReusableConfirmedScreenshots(existingScreenshotFields)) {
      { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
      return NextResponse.json({ error: "编辑提交缺少已确认的互动截图和完播截图，请重新上传" }, { status: 400 });
    }
  }

  const effectiveSnapshotPayload = (reusableScreenshotFields
    ? { ...preservedSnapshotPayload, ...reusableScreenshotFields }
    : preservedSnapshotPayload) as typeof snapshotPayload;

  const existingSnapshot: Record<string, unknown> | null = queriedSnapshot;

  // 编辑模式禁止创建新快照：绑定校验后快照意外缺失时立即阻断
  if (editBinding && editBinding.ok && !existingSnapshot) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: "原视频缺少24h快照，已停止编辑以避免覆盖历史数据" }, { status: 422 });
  }

  if (existingSnapshot) {
    rollbackActions.push(async () => {
      const { error } = await supabase.from("video_metrics_snapshots").update(stripId(existingSnapshot)).eq("id", existingSnapshot.id);
      if (error) throw error;
    });
  } else {
    rollbackActions.push(async () => {
      // video_metrics_snapshots 无成员 DELETE RLS，必须用 adminSupabase，否则 user client 静默 0 行
      const { error } = await adminSupabase
        .from("video_metrics_snapshots")
        .delete()
        .eq("video_id", persistedVideo.id)
        .eq("snapshot_type", "24h");
      if (error) throw error;
    });
  }

  const { data: persistedSnapshot, error: snapshotError } = existingSnapshot
    ? await supabase.from("video_metrics_snapshots").update(effectiveSnapshotPayload).eq("id", existingSnapshot.id).select(SNAPSHOT_WRITE_SELECT).single()
    : await supabase.from("video_metrics_snapshots").insert(effectiveSnapshotPayload).select(SNAPSHOT_WRITE_SELECT).single();

  if (snapshotError || !persistedSnapshot) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: snapshotError?.message || "视频快照创建失败" }, { status: 500 });
  }

  const dailyReportPayload = {
    user_id: user.id,
    report_date: normalized.biz_date,
    title: normalized.video_title || "视频提交",
    submitter,
    play_count: normalized.metrics.play_count,
    likes: normalized.metrics.likes,
    comments: normalized.metrics.comments,
    shares: normalized.metrics.shares,
    favorites: normalized.metrics.favorites,
    follower_gain: normalized.metrics.follower_gain,
    follower_convert: normalized.metrics.follower_convert,
    completion_rate: `${normalized.metrics.completion_rate}%`,
    avg_play_duration: `${normalized.metrics.avg_play_duration}秒`,
    bounce_rate_2s: `${normalized.metrics.bounce_rate_2s}%`,
    completion_rate_5s: `${normalized.metrics.completion_rate_5s}%`,
    content: normalized.content,
    published_at: normalized.published_at,
    uploaded_at: nowIso,
    account_id: normalized.account_id,
    script_author_user_id: roleUserIds.scriptAuthorUserId,
    video_editor_user_id: roleUserIds.videoEditorUserId,
    operator_user_id: roleUserIds.operatorUserId,
  };

  const { data: existingReport, error: existingReportError } = editBinding && editBinding.ok
    ? { data: editBinding.dailyReport, error: null }
    : await supabase
      .from("daily_reports")
      .select(
        "id, user_id, account_id, script_author_user_id, video_editor_user_id, operator_user_id, submitter, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
      )
      .eq("account_id", normalized.account_id)
      .eq("report_date", normalized.biz_date)
      .maybeSingle();

  if (existingReportError) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: existingReportError.message }, { status: 500 });
  }

  // 编辑模式禁止创建新日报：绑定校验后日报意外缺失时立即阻断
  if (editBinding && editBinding.ok && !existingReport) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: "原日报不存在，已停止编辑以避免新建日报" }, { status: 404 });
  }

  if (existingReport) {
    rollbackActions.push(async () => {
      const { error } = await supabase.from("daily_reports").update(stripId(existingReport)).eq("id", existingReport.id);
      if (error) throw error;
    });
  } else {
    rollbackActions.push(async () => {
      const { error } = await supabase
        .from("daily_reports")
        .delete()
        .eq("account_id", normalized.account_id)
        .eq("report_date", normalized.biz_date);
      if (error) throw error;
    });
  }

  const { data: persistedReport, error: dailyReportError } = existingReport
    ? await supabase.from("daily_reports").update(dailyReportPayload).eq("id", existingReport.id).select(DAILY_REPORT_WRITE_SELECT).single()
    : await supabase.from("daily_reports").insert(dailyReportPayload).select(DAILY_REPORT_WRITE_SELECT).single();

  if (dailyReportError || !persistedReport) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: dailyReportError?.message || "日报记录创建失败" }, { status: 500 });
  }

  const previousTagsResult = await supabase
    .from("video_tags")
    .select("id, video_id, tag_dimension, tag_value, source, confidence, reason, reviewed_by, created_at")
    .eq("video_id", persistedVideo.id);

  if (previousTagsResult.error) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: previousTagsResult.error.message }, { status: 500 });
  }

  const previousTags = previousTagsResult.data ?? [];
  rollbackActions.push(async () => {
    // video_tags 在 20260727193000 之前无成员 DELETE RLS，用 adminSupabase 保证回滚可靠执行
    const { error: deleteError } = await adminSupabase.from("video_tags").delete().eq("video_id", persistedVideo.id);
    if (deleteError) throw deleteError;

    if (!previousTags.length) {
      return;
    }

    const { error: insertError } = await adminSupabase.from("video_tags").insert(previousTags);
    if (insertError) throw insertError;
  });

  const aiTags = await generateAiTags(normalized.content);

  if (aiTags.length) {
    const aiTagPayload = dedupeTagPayloads(
      aiTags.map((tag) => ({
        video_id: persistedVideo.id,
        tag_dimension: tag.tag_dimension,
        tag_value: tag.tag_value,
        source: "ai" as const,
        confidence: tag.confidence,
        reason: tag.reason,
        reviewed_by: null,
      }))
    );

    const aiDimensions = [...new Set(aiTagPayload.map((tag) => tag.tag_dimension))];
    const { error: deleteAiTagError } = await supabase
      .from("video_tags")
      .delete()
      .eq("video_id", persistedVideo.id)
      .in("tag_dimension", aiDimensions);

    if (deleteAiTagError) {
      { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
      return NextResponse.json({ error: deleteAiTagError.message }, { status: 500 });
    }

    const { error: insertAiTagError } = await supabase.from("video_tags").insert(aiTagPayload);

    if (insertAiTagError) {
      { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
      return NextResponse.json({ error: insertAiTagError.message }, { status: 500 });
    }
  }

  const manualTags = buildManualTagPayload({
    videoId: persistedVideo.id,
    topicTag: normalized.topic_tag,
    videoForm: normalized.video_form,
    contentKeywords: normalized.content_keywords,
  });

  const { error: deleteManualTagError } = await supabase
    .from("video_tags")
    .delete()
    .eq("video_id", persistedVideo.id)
    .in("tag_dimension", ["话题", "表达形式", "关键词"]);

  if (deleteManualTagError) {
    { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
    return NextResponse.json({ error: deleteManualTagError.message }, { status: 500 });
  }

  if (manualTags.length) {
    const { error: insertManualTagError } = await supabase.from("video_tags").insert(manualTags);
    if (insertManualTagError) {
      { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
      return NextResponse.json({ error: insertManualTagError.message }, { status: 500 });
    }
  }

  if (normalized.metrics.follower_convert > 0 && normalized.script_text) {
    const usageRecordResult = await replaceDailyReportUsageRecord(createAdminClient(), user.id, {
      case_id: null,
      script_text: normalized.script_text,
      script_format: normalized.script_format,
      account_id: normalized.account_id,
      used_at: normalized.biz_date,
      views: normalized.metrics.play_count,
      follows: normalized.metrics.follower_convert,
      source: "daily_report",
      daily_report_id: persistedReport.id,
      note: null,
    });

    if (!usageRecordResult.ok) {
      { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
      return NextResponse.json({ error: usageRecordResult.message }, { status: usageRecordResult.status });
    }
  } else if (normalized.mode === "edit") {
    const { error: clearUsageError } = await createAdminClient()
      .from("script_usage_records")
      .delete()
      .eq("daily_report_id", persistedReport.id)
      .eq("recorded_by", user.id);
    if (clearUsageError) {
      { const rbErr = await rollbackSafely(rollbackActions); if (rbErr) console.error("[video-submit] rollback failed", rbErr); }
      return NextResponse.json({ error: "清除原导粉话术使用记录失败" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    video_id: persistedVideo.id,
    anomaly_status: normalized.anomaly_status,
    video: persistedVideo,
    ai_tags: aiTags,
    idempotent_video_id: submissionVideoId,
  });
}
