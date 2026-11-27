import type { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/api-logger";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import { isActiveMembership } from "@/lib/member-lifecycle";
import { emit, type EmitResult } from "@/lib/notifications/server";
import { formatPostSubmitReviewReason } from "@/lib/video-submit-deadline";
import type { NormalizedVideoSubmit } from "./prechecks";

type AdminSupabaseLike = ReturnType<typeof createAdminClient>;

export type PostSubmitReviewTrigger = {
  reason: "expired" | "manual_published_at";
  publishedDate: string | null;
  elapsedHours: number | null;
  ocrPublishedAtText: string | null;
};

export type PostSubmitReviewOutcome = {
  required: true;
  status: "created" | "partial" | "failed";
  appealId: string | null;
  triggerReason: "expired" | "manual_published_at";
  todoStatus: "succeeded" | "failed" | "skipped";
  warning: string | null;
  requestId: string;
};

function isDuplicateKeyError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

function buildPostReviewSummaryPayload(input: {
  normalized: NormalizedVideoSubmit;
  videoId: string;
  dailyReportId: string;
  uploadedAt: string;
  elapsedHours: number | null;
}) {
  const { normalized, videoId, dailyReportId, uploadedAt, elapsedHours } = input;
  return {
    mode: normalized.mode,
    review_mode: "post_submit",
    video_id: videoId,
    daily_report_id: dailyReportId,
    video_title: normalized.video_title,
    published_at: normalized.published_at,
    published_at_text: normalized.published_at_text,
    published_at_source: normalized.published_at_source ?? null,
    ocr_published_at_text: normalized.ocr_published_at_text ?? null,
    uploaded_at: uploadedAt,
    elapsed_hours: elapsedHours != null && Number.isFinite(elapsedHours) ? Math.round(elapsedHours * 10) / 10 : null,
    play_count: normalized.metrics.play_count,
    assets: normalized.assets.map((asset) => ({ role: asset.role, url: asset.url })),
  };
}

async function resolveTeamAdminRecipients(admin: AdminSupabaseLike, userId: string, teamId: string | null): Promise<string[]> {
  if (!teamId) return [];
  const { data: candidates } = await admin
    .from("profiles")
    .select("id, role, company_role, permissions, team_id, membership_status")
    .in("role", ["owner", "admin"]);
  return (candidates ?? [])
    .filter((profile) => {
      if (profile.id === userId || !isActiveMembership(profile)) return false;
      const role = resolveProfileCompanyRole(profile.role, profile.company_role);
      return !role.conflict
        && (role.companyRole === "company_owner" || (role.companyRole === "admin" && profile.permissions?.manage_members === true))
        && profile.team_id === teamId;
    })
    .map((profile) => profile.id);
}

export async function createPostSubmitReviewAndNotify(
  input: {
    admin: AdminSupabaseLike;
    userId: string;
    submitter: string;
    teamId: string | null;
    accountId: string;
    accountName: string | null;
    recordDate: string;
    videoId: string;
    dailyReportId: string;
    nowIso: string;
    normalized: NormalizedVideoSubmit;
    trigger: PostSubmitReviewTrigger;
    requestId?: string | null;
  },
  emitFn: typeof emit = emit,
): Promise<PostSubmitReviewOutcome> {
  const requestId = input.requestId?.trim() || crypto.randomUUID();
  const reason = formatPostSubmitReviewReason({
    reason: input.trigger.reason,
    elapsedHours: input.trigger.elapsedHours,
    ocrPublishedAtText: input.trigger.ocrPublishedAtText,
  });
  const roundedHours = input.trigger.elapsedHours != null && Number.isFinite(input.trigger.elapsedHours)
    ? Math.round(input.trigger.elapsedHours * 10) / 10
    : null;
  const summaryPayload = buildPostReviewSummaryPayload({
    normalized: input.normalized,
    videoId: input.videoId,
    dailyReportId: input.dailyReportId,
    uploadedAt: input.nowIso,
    elapsedHours: roundedHours,
  });

  let appealId: string | null = null;
  try {
    const insertResult = await input.admin
      .from("fulfillment_appeals")
      .insert({
        user_id: input.userId,
        account_id: input.accountId,
        record_date: input.recordDate,
        reason,
        status: "pending",
        review_mode: "post_submit",
        video_id: input.videoId,
        daily_report_id: input.dailyReportId,
        trigger_reason: input.trigger.reason,
        ocr_published_at_text: input.trigger.ocrPublishedAtText,
        elapsed_hours: roundedHours,
        submission_payload: summaryPayload,
      })
      .select("id")
      .single();

    if (insertResult.error && isDuplicateKeyError(insertResult.error)) {
      const existing = await input.admin
        .from("fulfillment_appeals")
        .select("id")
        .eq("video_id", input.videoId)
        .eq("review_mode", "post_submit")
        .eq("status", "pending")
        .maybeSingle();
      appealId = existing.data?.id ?? null;
    } else if (insertResult.error || !insertResult.data?.id) {
      throw insertResult.error ?? new Error("insert post-submit review returned empty row");
    } else {
      appealId = insertResult.data.id;
    }
  } catch (error) {
    logApiError(
      {
        requestId,
        route: "/api/video-submit",
        status: 500,
        outcome: "failed",
        detail: {
          operation: "create-post-submit-review",
          videoId: input.videoId,
          dailyReportId: input.dailyReportId,
          triggerReason: input.trigger.reason,
        },
      },
      error,
    );
    return {
      required: true,
      status: "failed",
      appealId: null,
      triggerReason: input.trigger.reason,
      todoStatus: "skipped",
      warning: `作品已入库，但事后核查单写入失败，请联系管理员核对（编号：${requestId}）`,
      requestId,
    };
  }

  if (!appealId) {
    return {
      required: true,
      status: "failed",
      appealId: null,
      triggerReason: input.trigger.reason,
      todoStatus: "skipped",
      warning: `作品已入库，但事后核查单编号未返回，请联系管理员核对（编号：${requestId}）`,
      requestId,
    };
  }

  let notification: EmitResult;
  try {
    const recipients = await resolveTeamAdminRecipients(input.admin, input.userId, input.teamId);
    const titleLabel = input.normalized.video_title ? `《${input.normalized.video_title}》` : "未命名作品";
    notification = await emitFn({
      recipients,
      type: "fulfillment.appeal",
      category: "todo",
      severity: "warning",
      title: `${input.submitter}有超期/手改提交待核查`,
      body: `${input.accountName || "账号"} · ${input.recordDate} · ${titleLabel}\n${reason}`,
      actionLabel: "去核查",
      actionUrl: "/admin/fulfillment",
      sourceType: "fulfillment_appeal",
      sourceId: appealId,
      payload: {
        appealId,
        reviewMode: "post_submit",
        videoId: input.videoId,
        dailyReportId: input.dailyReportId,
        accountId: input.accountId,
        recordDate: input.recordDate,
        userId: input.userId,
        triggerReason: input.trigger.reason,
      },
    });
  } catch (error) {
    notification = { ok: false, inserted: 0, error: error instanceof Error ? error.message : "emit failed" };
  }

  if (!notification.ok) {
    logApiError(
      {
        requestId,
        route: "/api/video-submit",
        status: 500,
        outcome: "failed",
        detail: {
          operation: "emit-post-submit-review-todo",
          appealId,
          videoId: input.videoId,
          triggerReason: input.trigger.reason,
        },
      },
      notification.error ?? "post-submit todo emit failed",
    );
    return {
      required: true,
      status: "partial",
      appealId,
      triggerReason: input.trigger.reason,
      todoStatus: "failed",
      warning: `作品已入库并生成事后核查单，但管理员待办通知未送达，请提醒管理员前往审批工作台核查（编号：${requestId}）`,
      requestId,
    };
  }

  return {
    required: true,
    status: "created",
    appealId,
    triggerReason: input.trigger.reason,
    todoStatus: "succeeded",
    warning: null,
    requestId,
  };
}
