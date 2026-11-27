import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
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
  buildSubmissionAssigneeColumns,
  collectAssigneeIdsRequiringValidation,
  mergePreservedEditMetricFields,
  mergePreservedEditSnapshotFields,
} from "./edit-binding";
import * as submitResponseFields from "./response-fields";
import { validateTopicForSubmission } from "./topic-association";
import { resolveVideoSubmitMembershipResponse } from "./membership";
import { resolveDailyReportSubmissionTarget } from "./report-target";
import { ensureInternalLibraryEntry, type TopicLibraryEntryOutcome } from "@/lib/topics/library";
import { normalizeDailyReportDataSource, resolveDailyReportDataSource } from "@/lib/daily-report-data-source";
import {
  appendObservedMutationResult,
  observeMutationRequest,
  type MutationObservation,
} from "@/lib/observed-mutation-result";
import { videoSubmitErrorResponse } from "./error-response";
import {
  buildDailyReportPayload,
  buildSnapshotPayload,
  buildScreenshotReplacementHistoryRows,
  runSubmissionPersistenceStep,
  SUBMISSION_PERSISTENCE_ERROR_CODES,
  stripSubmissionId,
} from "./persist";
import {
  assertReadableSubmissionScreenshots,
  checkCreateDuplicateSubmission,
  evaluateSubmissionDeadlineGuard,
  validateExternalAssignees,
} from "./prechecks";
import {
  finalizeVideoSubmission,
  loadValidatedEditBinding,
  replaceSubmissionManualTags,
  restoreVideoSubmission,
  rollbackNewVideoSubmission,
  rollbackSafely,
  type RollbackAction,
} from "./persistence-orchestrator";

import type { createPostSubmitReviewAndNotify } from "./post-review";

export { buildPublishedDayWindow } from "./create-conflict";
export { resolvePublishEvidenceFailureMessage, shouldCheckPublishDeadline } from "./prechecks";
export {
  rollbackSafely,
  rollbackNewVideoSubmission,
  type VideoSubmissionRollbackRpc,
} from "./persistence-orchestrator";

export type VideoSubmitDeps = {
  createClient: typeof createClient;
  createAdminClient: typeof createAdminClient;
  createPostSubmitReview?: typeof createPostSubmitReviewAndNotify;
};

/** 服务端内部代指定用户提交；外部 HTTP 路由不会传入此参数。 */
export type VideoSubmitActor = { userId: string };

export const defaultVideoSubmitDeps: VideoSubmitDeps = { createClient, createAdminClient };

async function handleVideoSubmit(
  request: NextRequest,
  observation?: MutationObservation,
  deps: VideoSubmitDeps = defaultVideoSubmitDeps,
  actor?: VideoSubmitActor,
) {
  observation?.mark("auth");
  const supabase = actor ? deps.createAdminClient() : await deps.createClient();
  const userId = actor ? actor.userId : (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  observation?.mark("read");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, team_id, membership_status")
    .eq("id", userId)
    .single();
  if (profileError) {
    return videoSubmitErrorResponse(request, observation?.requestId, "load-submitter-profile", profileError.message);
  }
  const membershipResponse = resolveVideoSubmitMembershipResponse(profile);
  if (membershipResponse) return membershipResponse;

  const typedProfile = profile as { name: string | null; team_id: string | null; membership_status: string | null };

  let body: unknown;
  try {
    observation?.mark("validate");
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const validationResult = validateVideoSubmitPayload(body);
  if (!validationResult.ok) return NextResponse.json({ error: validationResult.error }, { status: 400 });
  const normalized = validationResult.normalized;
  const submissionVideoId = buildSubmissionRecordId(normalized);

  let editContract: EditSubmissionContract | null = null;
  if (normalized.mode === "edit") {
    const editContractResult = buildEditSubmissionContract(body);
    if (!editContractResult.ok) return NextResponse.json({ error: editContractResult.error }, { status: 400 });
    editContract = editContractResult.dto;
  }

  observation?.mark("scope");
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, profile_id, name")
    .eq("id", normalized.account_id)
    .single();
  if (accountError || !account || account.profile_id !== userId) {
    return NextResponse.json({ error: "账号不存在或无权限提交" }, { status: 403 });
  }

  const duplicateResponse = await checkCreateDuplicateSubmission({
    supabase,
    createAdminClient: deps.createAdminClient,
    userId,
    submissionVideoId,
    normalized,
  });
  if (duplicateResponse) return duplicateResponse;

  const deadlineGuard = await evaluateSubmissionDeadlineGuard({ supabase, userId, normalized });
  if (!deadlineGuard.ok) return deadlineGuard.response;
  const approvedAppealUsed = deadlineGuard.approvedAppealUsed;

  const editBinding = await loadValidatedEditBinding({ supabase, editContract, userId, normalized });
  if (editBinding && !editBinding.ok) {
    return NextResponse.json({ error: editBinding.error }, { status: editBinding.status });
  }

  const screenshotAccess = await assertReadableSubmissionScreenshots(
    userId,
    normalized.assets.map((asset) => asset.url),
    getSiteOrigin() ?? request.nextUrl.origin,
  );
  if (!screenshotAccess.ok) {
    return NextResponse.json({ error: screenshotAccess.error }, { status: screenshotAccess.status });
  }

  if (normalized.topic_id) {
    const topicAssociation = await validateTopicForSubmission(deps.createAdminClient(), normalized.topic_id);
    if (!topicAssociation.ok) {
      return videoSubmitErrorResponse(
        request,
        observation?.requestId,
        "validate-topic-association",
        topicAssociation.message,
        topicAssociation.status,
        topicAssociation.message,
      );
    }
  }

  const submitter = typedProfile.name ?? "未知";
  const roleUserIds = editContract
    ? {
        scriptAuthorUserId: editContract.assignees.script_author_user_id,
        videoEditorUserId: editContract.assignees.video_editor_user_id,
        operatorUserId: editContract.assignees.operator_user_id,
      }
    : resolveSubmissionRoleUserIds(normalized, userId);
  const originalAssignees = editBinding && editBinding.ok
    ? {
        scriptAuthorUserId: editBinding.video.script_author_user_id,
        videoEditorUserId: editBinding.video.video_editor_user_id,
        operatorUserId: editBinding.video.operator_user_id,
      }
    : null;
  const assigneeColumns = buildSubmissionAssigneeColumns(roleUserIds);
  const externalAssigneeIds = collectAssigneeIdsRequiringValidation(roleUserIds, originalAssignees, userId);
  const assigneeErrorResponse = await validateExternalAssignees({
    createAdminClient: deps.createAdminClient,
    externalAssigneeIds,
    submitterTeamId: typedProfile.team_id,
  });
  if (assigneeErrorResponse) return assigneeErrorResponse;

  const nowIso = new Date().toISOString();
  const rollbackActions: RollbackAction[] = [];
  const rollbackAndMark = async () => {
    observation?.mark("compensate");
    return rollbackSafely(rollbackActions);
  };

  const videoPayload = {
    id: submissionVideoId,
    account_id: normalized.account_id,
    user_id: userId,
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
    ...assigneeColumns,
  };

  const adminSupabase = deps.createAdminClient();
  let existingVideo: (Record<string, unknown> & {
    id: string;
    account_id: string;
    user_id: string;
    published_at?: string | null;
    topic_id?: string | null;
    lifecycle_state?: string | null;
    script_author_user_id?: string | null;
    video_editor_user_id?: string | null;
    operator_user_id?: string | null;
  }) | null = null;

  if (editBinding && editBinding.ok) {
    existingVideo = editBinding.video;
  } else {
    const { data: fetchedVideo, error: existingVideoError } = await adminSupabase
      .from("videos")
      .select("id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, punish_type, platform_notice, appeal, topic_id, script_author_user_id, video_editor_user_id, operator_user_id, lifecycle_state, created_at")
      .eq("id", submissionVideoId)
      .maybeSingle();
    if (existingVideoError) {
      return videoSubmitErrorResponse(request, observation?.requestId, "load-existing-video", existingVideoError.message);
    }
    if (fetchedVideo && fetchedVideo.user_id !== userId) {
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
  if (normalized.mode === "edit" && existingVideo) {
    videoPayload.published_at = existingVideo.published_at ?? null;
  }

  const videoWriteMode = resolveSubmissionVideoWriteMode(existingVideo?.lifecycle_state ?? null);
  if (existingVideo && videoWriteMode === "insert") {
    return NextResponse.json({ error: "视频记录已永久删除，请修改内容后重新提交" }, { status: 409 });
  }
  if (videoWriteMode === "restore_then_update") {
    try {
      await restoreVideoSubmission(submissionVideoId, userId, deps.createAdminClient);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "视频记录恢复失败" }, { status: 500 });
    }
  }

  if (existingVideo) {
    rollbackActions.push(async () => {
      const { error } = await adminSupabase.from("videos").update(stripSubmissionId(existingVideo)).eq("id", existingVideo.id);
      if (error) throw error;
    });
  } else {
    rollbackActions.push(async () => {
      await rollbackNewVideoSubmission(submissionVideoId, userId);
    });
  }

  observation?.mark("write-video");
  const videoStep = await runSubmissionPersistenceStep("video", async () => existingVideo
    ? await supabase
      .from("videos")
      .update(stripSubmissionId({
        ...videoPayload,
        topic_id: resolveEditTopicId(normalized.mode, normalized.topic_id, existingVideo.topic_id ?? null),
      }))
      .eq("id", submissionVideoId)
      .select(submitResponseFields.VIDEO_SUBMIT_RESPONSE_SELECT)
      .single()
    : supabase.from("videos").insert(videoPayload).select(submitResponseFields.VIDEO_SUBMIT_RESPONSE_SELECT).single(), rollbackAndMark);
  const persistedVideo = videoStep.ok ? videoStep.data : null;
  const videoError = videoStep.ok ? null : videoStep.error;
  if (videoError || !persistedVideo) {
    return NextResponse.json({ error: videoError instanceof Error ? videoError.message : "视频记录创建失败", code: SUBMISSION_PERSISTENCE_ERROR_CODES.video }, { status: 500 });
  }

  const snapshotPayload = buildSnapshotPayload(normalized, persistedVideo.id);
  const { data: queriedSnapshot, error: existingSnapshotError } = editBinding && editBinding.ok
    ? { data: editBinding.snapshot24h, error: null }
    : await supabase
      .from("video_metrics_snapshots")
      .select("id, video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain, follower_loss, fan_play_ratio, homepage_visits, follower_convert, cover_click_rate, avg_play_duration, completion_rate, bounce_rate_2s, completion_rate_5s, avg_play_ratio, vs_previous, screenshot_urls, curve_screenshot_url, retention_screenshot_url, captured_at")
      .eq("video_id", persistedVideo.id)
      .eq("snapshot_type", "24h")
      .maybeSingle();
  if (existingSnapshotError) {
    const rbErr = await rollbackAndMark();
    if (rbErr) console.error("[video-submit] rollback failed", rbErr);
    return videoSubmitErrorResponse(request, observation?.requestId, "load-existing-snapshot", existingSnapshotError.message);
  }

  const preservedSnapshotPayload = mergePreservedEditSnapshotFields(normalized.mode, snapshotPayload, editBinding && editBinding.ok ? editBinding.snapshot24h : null);
  const preservedNullableSnapshotPayload = mergePreservedEditMetricFields(normalized.mode, preservedSnapshotPayload, queriedSnapshot);
  const existingScreenshotFields = queriedSnapshot as ExistingSubmissionScreenshotFields | null;
  const screenshotReplacementHistoryRows = buildScreenshotReplacementHistoryRows({
    existing: existingScreenshotFields,
    assets: normalized.assets,
    videoId: persistedVideo.id,
    accountId: normalized.account_id,
    userId,
    replacedAt: nowIso,
  });
  const reusableScreenshotFields = mergeReusableScreenshotFields(normalized.mode, normalized.assets, existingScreenshotFields);

  if (normalized.mode === "edit" && normalized.assets.length === 0) {
    const existingScreenshotAccess = await assertReadableSubmissionScreenshots(
      userId,
      getExistingScreenshotUrls(existingScreenshotFields),
      getSiteOrigin() ?? request.nextUrl.origin,
    );
    if (!existingScreenshotAccess.ok) {
      const rbErr = await rollbackAndMark();
      if (rbErr) console.error("[video-submit] rollback failed", rbErr);
      return NextResponse.json({ error: existingScreenshotAccess.error }, { status: existingScreenshotAccess.status });
    }
    if (normalized.anomaly_status === "normal" && !hasReusableConfirmedScreenshots(existingScreenshotFields)) {
      const rbErr = await rollbackAndMark();
      if (rbErr) console.error("[video-submit] rollback failed", rbErr);
      return NextResponse.json({ error: "编辑提交缺少已确认的互动截图和完播截图，请重新上传" }, { status: 400 });
    }
  }

  const effectiveSnapshotPayload = (reusableScreenshotFields
    ? { ...preservedNullableSnapshotPayload, ...reusableScreenshotFields }
    : preservedNullableSnapshotPayload) as typeof snapshotPayload;
  const existingSnapshot: Record<string, unknown> | null = queriedSnapshot;

  if (editBinding && editBinding.ok && !existingSnapshot) {
    const rbErr = await rollbackAndMark();
    if (rbErr) console.error("[video-submit] rollback failed", rbErr);
    return NextResponse.json({ error: "原视频缺少24h快照，已停止编辑以避免覆盖历史数据" }, { status: 422 });
  }

  if (existingSnapshot) {
    rollbackActions.push(async () => {
      const { error } = await supabase.from("video_metrics_snapshots").update(stripSubmissionId(existingSnapshot)).eq("id", existingSnapshot.id);
      if (error) throw error;
    });
  } else {
    rollbackActions.push(async () => {
      const { error } = await adminSupabase.from("video_metrics_snapshots").delete().eq("video_id", persistedVideo.id).eq("snapshot_type", "24h");
      if (error) throw error;
    });
  }

  observation?.mark("write-snapshot");
  const snapshotStep = await runSubmissionPersistenceStep("snapshot", async () => existingSnapshot
    ? await supabase.from("video_metrics_snapshots").update(effectiveSnapshotPayload).eq("id", existingSnapshot.id).select(submitResponseFields.SNAPSHOT_WRITE_SELECT).single()
    : await supabase.from("video_metrics_snapshots").insert(effectiveSnapshotPayload).select(submitResponseFields.SNAPSHOT_WRITE_SELECT).single(), rollbackAndMark);
  const persistedSnapshot = snapshotStep.ok ? snapshotStep.data : null;
  const snapshotError = snapshotStep.ok ? null : snapshotStep.error;
  if (snapshotError || !persistedSnapshot) {
    return NextResponse.json({ error: snapshotError instanceof Error ? snapshotError.message : "视频快照创建失败", code: SUBMISSION_PERSISTENCE_ERROR_CODES.snapshot }, { status: 500 });
  }

  const dailyReportPayload = buildDailyReportPayload({ normalized, videoId: persistedVideo.id, userId, submitter, nowIso, assigneeColumns, existingVideo });
  const existingReport = resolveDailyReportSubmissionTarget({ mode: normalized.mode, editBinding }).existingReport;
  if (editBinding && editBinding.ok && !existingReport) {
    const rbErr = await rollbackAndMark();
    if (rbErr) console.error("[video-submit] rollback failed", rbErr);
    return NextResponse.json({ error: "原日报不存在，已停止编辑以避免新建日报" }, { status: 404 });
  }

  const effectiveDailyReportPayload = mergePreservedEditMetricFields(normalized.mode, dailyReportPayload, existingReport);
  observation?.mark("write-report");
  const reportStep = await runSubmissionPersistenceStep("report", async () => existingReport
    ? await supabase.from("daily_reports").update(effectiveDailyReportPayload).eq("id", existingReport.id).select(submitResponseFields.DAILY_REPORT_WRITE_SELECT).single()
    : await supabase.from("daily_reports").insert(effectiveDailyReportPayload).select(submitResponseFields.DAILY_REPORT_WRITE_SELECT).single(), rollbackAndMark);
  const persistedReport = reportStep.ok ? reportStep.data : null;
  const dailyReportError = reportStep.ok ? null : reportStep.error;
  if (dailyReportError || !persistedReport) {
    return NextResponse.json({ error: dailyReportError instanceof Error ? dailyReportError.message : "日报记录创建失败", code: SUBMISSION_PERSISTENCE_ERROR_CODES.report }, { status: 500 });
  }

  if (existingReport) {
    rollbackActions.push(async () => {
      const { error } = await supabase.from("daily_reports").update(stripSubmissionId(existingReport)).eq("id", existingReport.id);
      if (error) throw error;
    });
  } else {
    const createdReportId = persistedReport.id;
    rollbackActions.push(async () => {
      const { error } = await supabase.from("daily_reports").delete().eq("id", createdReportId);
      if (error) throw error;
    });
  }

  observation?.mark("write-tags");
  const tagResult = await replaceSubmissionManualTags({
    supabase,
    adminSupabase,
    videoId: persistedVideo.id,
    normalized,
  });
  if (!tagResult.ok) {
    const rollbackError = await rollbackAndMark();
    if (rollbackError) console.error("[video-submit] rollback failed", rollbackError);
    return NextResponse.json({ error: tagResult.error.message, code: SUBMISSION_PERSISTENCE_ERROR_CODES.tags }, { status: 500 });
  }

  const dataSource = resolveDailyReportDataSource({
    existing: normalizeDailyReportDataSource(existingReport?.data_source),
    hasOcrRecognizedFields: normalized.assets.some((asset) => Boolean(asset.recognized_fields && Object.keys(asset.recognized_fields).length > 0)),
    hasManualEdit: normalized.manual_edit,
    screenshotsRefreshed: normalized.screenshots_refreshed || screenshotReplacementHistoryRows.length > 0,
  });
  const { error: dataSourceError } = await supabase.from("daily_reports").update({ data_source: dataSource }).eq("id", persistedReport.id);
  if (dataSourceError) {
    const rollbackError = await rollbackAndMark();
    if (rollbackError) console.error("[video-submit] rollback failed", rollbackError);
    return NextResponse.json({ error: `保存日报来源失败：${dataSourceError.message}`, code: SUBMISSION_PERSISTENCE_ERROR_CODES.source }, { status: 500 });
  }

  if (screenshotReplacementHistoryRows.length) {
    observation?.mark("write-screenshot-history");
    const historyStep = await runSubmissionPersistenceStep("history", async () => {
      const result = await adminSupabase.from("video_screenshot_replacement_history").insert(screenshotReplacementHistoryRows);
      return { data: null, error: result.error };
    }, rollbackAndMark);
    if (!historyStep.ok) {
      console.error("[video-submit] screenshot history write failed", historyStep.error);
      return NextResponse.json({ error: "截图替换留痕保存失败，原记录未修改", code: SUBMISSION_PERSISTENCE_ERROR_CODES.history }, { status: 500 });
    }
  }

  const postReview = await finalizeVideoSubmission({
    createAdminClient: deps.createAdminClient,
    createPostSubmitReview: deps.createPostSubmitReview,
    observation, userId, submitter, teamId: typedProfile.team_id, accountName: account.name ?? null, nowIso,
    normalized, existingReport, persistedReport, persistedVideo, approvedAppealUsed,
    postReviewTrigger: deadlineGuard.postReviewTrigger,
  });
  let topicLibraryEntry: TopicLibraryEntryOutcome | null = null;
  try {
    topicLibraryEntry = await ensureInternalLibraryEntry(deps.createAdminClient(), persistedVideo.id, typedProfile.team_id!);
  } catch (libraryError) {
    console.error("[video-submit] topic library auto entry failed", libraryError);
  }

  return NextResponse.json({
    ok: true,
    video_id: persistedVideo.id,
    ...submitResponseFields.buildSubmittedDailyReportFields(persistedReport),
    anomaly_status: normalized.anomaly_status,
    video: persistedVideo,
    idempotent_video_id: submissionVideoId,
    topic_library_entry: topicLibraryEntry,
    ...(postReview ? { post_review: postReview } : {}),
  });
}

export async function buildVideoSubmitResponse(
  request: NextRequest,
  deps: VideoSubmitDeps = defaultVideoSubmitDeps,
  observation?: MutationObservation,
  actor?: VideoSubmitActor,
) {
  return handleVideoSubmit(request, observation, deps, actor);
}

export async function POST(request: NextRequest) {
  return observeMutationRequest(
    "/api/video-submit",
    request,
    (observation) =>
      buildVideoSubmitResponse(request, defaultVideoSubmitDeps, observation).then((response) =>
        appendObservedMutationResult(response, observation),
      ),
  );
}
