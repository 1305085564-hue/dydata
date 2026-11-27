import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getOwnedSubmissionScreenshotPaths } from "@/lib/submission-screenshot-access";
import { findReadableSubmissionScreenshots } from "@/lib/screenshot-storage";
import { filterActiveMemberships, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import { findApprovedAppealForSubmission } from "./appeal-consumption";
import { buildPublishedDayWindow, resolveCreateSubmissionConflict } from "./create-conflict";
import {
  isPublishedAtConfirmed,
  resolveVideoSubmitDeadline,
  VIDEO_SUBMIT_EXPIRED_API_ERROR,
} from "@/lib/video-submit-deadline";
import type { validateVideoSubmitPayload } from "./validation";

export type NormalizedVideoSubmit = Extract<
  ReturnType<typeof validateVideoSubmitPayload>,
  { ok: true }
>["normalized"];

type SupabaseLike = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;
type AdminSupabaseLike = ReturnType<typeof createAdminClient>;

export function resolvePublishEvidenceFailureMessage(input: {
  reason: string;
  hasPublishScreenshot: boolean;
  punishType: string | null;
}) {
  if (input.reason === "unconfirmed_published_at") {
    return "未能识别作品真实发布时间，请重新上传能看清“发布”时间的完播截图后重试";
  }
  if (!input.hasPublishScreenshot) {
    // 只有「手上确实没有完播截图」才需要区分能否补救：
    // 删稿作品无法再提供截图，才指向管理员；其余（限流/正常）都能自助补传。
    return input.punishType === "deleted"
      ? "这条无法自动补交，请联系管理员确认。"
      : "作品发布时间缺失，请重新上传能看清“发布”时间的完播截图";
  }
  if (input.reason === "missing_published_at") {
    return "作品发布时间缺失，请重新上传能看清“发布”时间的完播截图";
  }
  return "作品发布时间无效，请重新上传能看清“发布”时间的完播截图";
}

/**
 * 72 小时补交门禁的适用范围：只豁免「异常上报」这一种提交模式。
 * 限流 / 删稿是作品状态，不是门禁豁免理由——否则标一个限流就能无审批补录任意旧日期。
 */
export function shouldCheckPublishDeadline(input: {
  mode: "create" | "edit" | "abnormal";
}) {
  return input.mode !== "abnormal";
}

export type ScreenshotAccessResult =
  | { ok: true; paths: string[] }
  | { ok: false; status: 400 | 403; error: string };

export async function assertReadableSubmissionScreenshots(
  userId: string,
  urls: string[],
  expectedOrigin: string,
  findReadableFn: typeof findReadableSubmissionScreenshots = findReadableSubmissionScreenshots,
): Promise<ScreenshotAccessResult> {
  const paths = getOwnedSubmissionScreenshotPaths(userId, urls, expectedOrigin);
  if (!paths) {
    return { ok: false, status: 403, error: "截图不存在或不属于当前用户，请重新上传" };
  }

  if (!paths.length) return { ok: true, paths };

  // 必须用与读路径一致的分层查找：COS 为唯一写入目标后，新图只写 COS、不写 Supabase。
  const { missing } = await findReadableFn(paths);
  if (missing.length) {
    return { ok: false, status: 400, error: "截图不存在或无法读取，请重新上传" };
  }

  return { ok: true, paths };
}

export async function checkCreateDuplicateSubmission(input: {
  supabase: SupabaseLike;
  createAdminClient: () => AdminSupabaseLike;
  userId: string;
  submissionVideoId: string;
  normalized: NormalizedVideoSubmit;
}): Promise<NextResponse | null> {
  const { supabase, createAdminClient, userId, submissionVideoId, normalized } = input;
  if (normalized.mode === "edit") return null;

  const dayWindow = normalized.video_title ? buildPublishedDayWindow(normalized.published_at) : null;
  const [existingReportResult, existingVideoResult, existingSameDayResult] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("id")
      .eq("video_id", submissionVideoId)
      .eq("user_id", userId)
      .eq("is_void", false)
      .limit(1),
    createAdminClient()
      .from("videos")
      .select("id")
      .eq("id", submissionVideoId)
      .limit(1),
    dayWindow
      ? createAdminClient()
          .from("videos")
          .select("id")
          .eq("account_id", normalized.account_id)
          .eq("video_title", normalized.video_title)
          .eq("lifecycle_state", "active")
          .gte("published_at", dayWindow.start)
          .lt("published_at", dayWindow.end)
          .limit(1)
      : Promise.resolve({ data: [] as { id: string }[] | null, error: null }),
  ]);

  if (existingReportResult.error || existingVideoResult.error || existingSameDayResult.error) {
    return NextResponse.json({ error: "核对重复提交状态失败" }, { status: 500 });
  }

  const duplicateResponse = resolveCreateSubmissionConflict({
    mode: normalized.mode,
    existingReportWithSameVideo: (existingReportResult.data ?? []).length > 0,
    existingVideo: (existingVideoResult.data ?? []).length > 0,
    existingActiveWorkSameDay: (existingSameDayResult.data ?? []).length > 0,
  });
  if (duplicateResponse) {
    return NextResponse.json(
      { error: "这条已经上传过,无需重复提交", code: "SUBMISSION_DUPLICATE" },
      { status: duplicateResponse.status },
    );
  }
  return null;
}

export async function evaluateSubmissionDeadlineGuard(input: {
  supabase: SupabaseLike;
  userId: string;
  normalized: NormalizedVideoSubmit;
}): Promise<
  | { ok: true; approvedAppealUsed: { id: string; submission_payload: unknown } | null }
  | { ok: false; response: NextResponse }
> {
  const { supabase, userId, normalized } = input;
  if (!shouldCheckPublishDeadline({ mode: normalized.mode })) {
    return { ok: true, approvedAppealUsed: null };
  }

  const deadline = resolveVideoSubmitDeadline({
    mode: normalized.mode === "edit" ? "edit" : "create",
    publishedAt: normalized.published_at,
    businessDate: normalized.biz_date,
    publishedAtConfirmed: isPublishedAtConfirmed(normalized.published_at_text),
    publishedAtSource: normalized.published_at_source,
  });
  const hasPublishScreenshot = normalized.assets.some((asset) => asset.role === "screenshot_2");

  if (deadline.decision === "invalid") {
    const message = resolvePublishEvidenceFailureMessage({
      reason: deadline.reason,
      hasPublishScreenshot,
      punishType: normalized.punish_type,
    });
    return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  }

  if (deadline.decision === "requires_confirmation") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: resolvePublishEvidenceFailureMessage({
            reason: deadline.reason,
            hasPublishScreenshot,
            punishType: normalized.punish_type,
          }),
          code: "PUBLISH_TIME_CONFIRM_REQUIRED",
          reason: deadline.reason,
        },
        { status: 409 },
      ),
    };
  }

  if (deadline.decision === "requires_appeal") {
    const { appeal: approvedAppeal, failed: appealFailed } = await findApprovedAppealForSubmission({
      supabase,
      userId,
      submitted: normalized,
    });
    if (appealFailed) {
      return { ok: false, response: NextResponse.json({ error: "核对补交审批状态失败" }, { status: 500 }) };
    }
    if (!approvedAppeal) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              deadline.reason === "manual_published_at"
                ? "发布时间由成员手工填写，请先申请补交"
                : VIDEO_SUBMIT_EXPIRED_API_ERROR,
            code: "SUBMISSION_APPEAL_REQUIRED",
            reason: deadline.reason,
            published_date: deadline.publishedDate,
            elapsed_hours: deadline.elapsedHours,
          },
          { status: 409 },
        ),
      };
    }
    return { ok: true, approvedAppealUsed: approvedAppeal };
  }

  return { ok: true, approvedAppealUsed: null };
}

export async function validateExternalAssignees(input: {
  createAdminClient: () => AdminSupabaseLike;
  externalAssigneeIds: string[];
  submitterTeamId: string | null;
}): Promise<NextResponse | null> {
  const { createAdminClient, externalAssigneeIds, submitterTeamId } = input;
  if (!externalAssigneeIds.length) return null;

  const assigneeProfilesResult = await loadWithMembershipFallback({
    loadWithMembership: async () =>
      createAdminClient()
        .from("profiles")
        .select("id, team_id, membership_status")
        .in("id", externalAssigneeIds),
    loadWithoutMembership: async () =>
      createAdminClient()
        .from("profiles")
        .select("id, team_id")
        .in("id", externalAssigneeIds),
  });
  const assigneeProfiles = filterActiveMemberships(
    (assigneeProfilesResult.data ?? []) as Array<{
      id: string;
      team_id: string | null;
      membership_status?: string | null;
    }>,
  );

  const validAssigneeIds = new Set(
    assigneeProfiles
      .filter((assignee) => (submitterTeamId ? assignee.team_id === submitterTeamId : false))
      .map((assignee) => assignee.id),
  );
  if (assigneeProfilesResult.error || externalAssigneeIds.some((id) => !validAssigneeIds.has(id))) {
    return NextResponse.json({ error: "责任人必须是当前团队或小组中的在职成员" }, { status: 403 });
  }
  return null;
}
