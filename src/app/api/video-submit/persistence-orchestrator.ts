import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MutationObservation } from "@/lib/observed-mutation-result";
import { consumeApprovedAppealPayload } from "./appeal-consumption";
import { scheduleFirstDailyReportNotice } from "./feishu-report-notice";
import { completeWritingOnSubmission } from "./topic-association";
import { buildManualTagPayload } from "./tag-payload";
import { persistSubmissionTags } from "./persist";
import {
  EDIT_BINDING_REPORT_SELECT,
  EDIT_BINDING_SNAPSHOT_SELECT,
  EDIT_BINDING_VIDEO_SELECT,
  validateEditSubmissionBinding,
} from "./edit-binding";
import type { EditSubmissionContract } from "./edit-detail";
import type { NormalizedVideoSubmit } from "./prechecks";
import {
  createPostSubmitReviewAndNotify,
  type PostSubmitReviewOutcome,
  type PostSubmitReviewTrigger,
} from "./post-review";

type SupabaseLike = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;
type AdminSupabaseLike = ReturnType<typeof createAdminClient>;

export type RollbackAction = () => Promise<void>;

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

export type VideoSubmissionRollbackRpc = (params: {
  p_video_id: string;
  p_user_id: string;
}) => Promise<{ data: unknown; error: { message?: string } | null }>;

const defaultVideoSubmissionRollbackRpc: VideoSubmissionRollbackRpc = async (params) => {
  const { data, error } = await createAdminClient().rpc("rollback_new_video_submission", params);
  if (!error) return { data, error: null };
  const errMsg = error.message;
  return { data, error: { message: errMsg } };
};

export async function rollbackNewVideoSubmission(
  videoId: string,
  userId: string,
  rpc: VideoSubmissionRollbackRpc = defaultVideoSubmissionRollbackRpc,
) {
  const { data, error } = await rpc({ p_video_id: videoId, p_user_id: userId });
  if (error || (data !== "deleted" && data !== "trashed")) {
    console.error("[video-submit] rollback_new_video_submission failed but non-blocking", {
      videoId,
      userId,
      data,
      error: error?.message,
    });
  }
}

export async function restoreVideoSubmission(
  videoId: string,
  userId: string,
  createAdminClientFn: typeof createAdminClient = createAdminClient,
) {
  const { data, error } = await createAdminClientFn().rpc("transition_video_lifecycle_with_report_link", {
    p_video_id: videoId,
    p_action: "restore",
    p_actor_id: userId,
    p_restore_reports: false,
  });
  const restored = Array.isArray(data) ? data[0] : null;
  if (error || restored?.lifecycle_state !== "active") {
    throw new Error(error?.message || "视频记录恢复失败");
  }
}

export async function loadValidatedEditBinding(input: {
  supabase: SupabaseLike;
  editContract: EditSubmissionContract | null;
  userId: string;
  normalized: NormalizedVideoSubmit;
}) {
  const { supabase, editContract, userId, normalized } = input;
  if (!editContract) return null;
  return validateEditSubmissionBinding(
    { userId, accountId: normalized.account_id, bizDate: normalized.biz_date, videoId: editContract.video_id },
    {
      loadVideoById: async (videoId) => {
        const { data, error } = await supabase.from("videos").select(EDIT_BINDING_VIDEO_SELECT).eq("id", videoId).limit(2);
        return { data: (data ?? null) as never, error };
      },
      loadDailyReportsByAccountAndDate: async (accountId, bizDate) => {
        const { data, error } = await supabase
          .from("daily_reports")
          .select(EDIT_BINDING_REPORT_SELECT)
          .eq("account_id", accountId)
          .eq("report_date", bizDate)
          .eq("is_void", false)
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
  );
}

export async function replaceSubmissionManualTags(input: {
  supabase: SupabaseLike;
  adminSupabase: AdminSupabaseLike;
  videoId: string;
  normalized: NormalizedVideoSubmit;
}) {
  const { supabase, adminSupabase, videoId, normalized } = input;
  return persistSubmissionTags({
    loadPrevious: async () => {
      const result = await supabase
        .from("video_tags")
        .select("id, video_id, tag_dimension, tag_value, source, confidence, reason, reviewed_by, created_at")
        .eq("video_id", videoId);
      const errMsg = result.error ? result.error.message : null;
      return { data: (result.data ?? []) as unknown[], error: errMsg ? { message: errMsg } : null };
    },
    writeManualTags: async () => {
      const manualTags = buildManualTagPayload({
        videoId,
        topicTag: normalized.topic_tag,
        videoForm: normalized.video_form,
        contentKeywords: normalized.content_keywords,
      });
      const { error: deleteError } = await supabase
        .from("video_tags")
        .delete()
        .eq("video_id", videoId)
        .in("tag_dimension", ["话题", "表达形式", "关键词"]);
      if (deleteError) {
        const msg = deleteError.message;
        return { error: { message: msg } };
      }
      if (!manualTags.length) return {};
      const { error: insertError } = await supabase.from("video_tags").insert(manualTags);
      if (!insertError) return {};
      const msg = insertError.message;
      return { error: { message: msg } };
    },
    restorePrevious: async (rows) => {
      const { error: deleteError } = await adminSupabase.from("video_tags").delete().eq("video_id", videoId);
      if (deleteError) throw deleteError;
      if (!rows.length) return;
      const { error: insertError } = await adminSupabase.from("video_tags").insert(rows as Record<string, unknown>[]);
      if (insertError) throw insertError;
    },
  });
}

export async function finalizeVideoSubmission(input: {
  createAdminClient: typeof createAdminClient;
  createPostSubmitReview?: typeof createPostSubmitReviewAndNotify;
  observation?: MutationObservation;
  userId: string;
  submitter: string;
  teamId: string | null;
  accountName?: string | null;
  nowIso: string;
  normalized: NormalizedVideoSubmit;
  existingReport: { id: string } | null;
  persistedReport: { id: string; report_date: string };
  persistedVideo: {
    id: string;
    video_title?: string | null;
    video_url?: string | null;
    published_at?: string | null;
    topic_id?: string | null;
  };
  approvedAppealUsed: { id: string; submission_payload: unknown } | null;
  postReviewTrigger?: PostSubmitReviewTrigger | null;
}): Promise<PostSubmitReviewOutcome | null> {
  const {
    createAdminClient: makeAdminClient,
    createPostSubmitReview = createPostSubmitReviewAndNotify,
    observation,
    userId,
    submitter,
    teamId,
    accountName = null,
    nowIso,
    normalized,
    existingReport,
    persistedReport,
    persistedVideo,
    approvedAppealUsed,
    postReviewTrigger = null,
  } = input;

  scheduleFirstDailyReportNotice(existingReport, {
    submitter,
    teamId,
    reportDate: persistedReport.report_date,
    videoTitle: persistedVideo.video_title ?? normalized.video_title,
    videoUrl: persistedVideo.video_url ?? normalized.video_url,
    topicTag: normalized.topic_tag,
    publishedAt: persistedVideo.published_at ?? normalized.published_at,
    submittedAt: nowIso,
    metrics: normalized.metrics,
  });

  try {
    observation?.mark("finalize");
    const writingEnd = await completeWritingOnSubmission(
      makeAdminClient(),
      userId,
      persistedVideo.topic_id ?? normalized.topic_id ?? null,
      persistedVideo.id,
    );
    if (writingEnd.ended) console.log("[video-submit] writing state completed for topic", normalized.topic_id);
  } catch (writingError) {
    console.error("[video-submit] complete writing state failed", writingError);
  }

  await consumeApprovedAppealPayload({
    admin: makeAdminClient(),
    appeal: approvedAppealUsed,
    submitted: normalized,
  });

  if (!postReviewTrigger) return null;

  return createPostSubmitReview({
    admin: makeAdminClient(),
    userId,
    submitter,
    teamId,
    accountId: normalized.account_id,
    accountName,
    recordDate: persistedReport.report_date,
    videoId: persistedVideo.id,
    dailyReportId: persistedReport.id,
    nowIso,
    normalized,
    trigger: postReviewTrigger,
    requestId: observation?.requestId ?? null,
  });
}
