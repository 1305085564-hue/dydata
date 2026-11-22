"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isActiveTeamMembership,
  TEAM_MEMBERSHIP_REQUIRED_MESSAGE,
} from "@/app/api/topics/_shared";
import {
  buildRequestDraft,
  buildRequestDraftsForDates,
  isMissingExemptionRequestCategoryError,
  type GrantMode,
} from "@/lib/豁免流程";
import type { ExemptionCategory } from "@/types";
import { formatShanghaiDateOnly } from "@/lib/business-time";
import { checkPendingExemptionOverlap } from "@/lib/exemption-application-precheck";
import { writePendingExemptionRequests } from "@/lib/exemption-application-write";
import { resolveHistoryEditRpcErrorMessage } from "@/lib/history-report-edit-rpc";
import { parseNullableMetricInput } from "@/lib/video-24h-metrics-contract";
import {
  findChangedExternalDailyReportAssigneeIds,
  resolveDailyReportOnlyEditAccessError,
} from "@/lib/daily-report-only-edit";
import {
  REPORT_TEXT_MAX_LENGTH,
  REPORT_TITLE_MAX_LENGTH,
  validateReportMetricBoundaries,
  validateTextBoundary,
} from "@/lib/input-boundaries";
import {
  createAccount as createAccountAction,
  updateAccountName as updateAccountNameAction,
  updateAccountRemark as updateAccountRemarkAction,
  updateProfile as updateProfileAction,
} from "@/lib/account-actions";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function parseRequiredNumber(value: string | null | undefined, fieldName: string): number {
  const trimmed = value?.trim();
  if (trimmed === "") throw new Error(`必填数字字段 ${fieldName} 不能为空`);
  const num = Number(trimmed);
  if (!Number.isFinite(num)) throw new Error(`字段 ${fieldName} 必须是有效数字`);
  return num;
}

const ASSIGNEE_FORM_FIELDS = [
  "script_author_user_id",
  "video_editor_user_id",
  "operator_user_id",
] as const;

type AssigneeFormField = (typeof ASSIGNEE_FORM_FIELDS)[number];

export async function saveDailyReportOnlyEdit(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const accountId = String(formData.get("account_id") ?? "").trim();
  const reportId = String(formData.get("report_id") ?? "").trim();
  const reportDate = String(formData.get("report_date") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "") || null;
  if (!isUuidLike(accountId) || !isUuidLike(reportId) || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return { error: "日报编号或日期格式不正确，请重新打开修改" };
  }
  const titleBoundary = validateTextBoundary({
    label: "视频标题",
    value: title,
    maxLength: REPORT_TITLE_MAX_LENGTH,
    required: true,
  });
  if (!titleBoundary.ok) return { error: titleBoundary.error };
  const contentBoundary = validateTextBoundary({
    label: "文案",
    value: content,
    maxLength: REPORT_TEXT_MAX_LENGTH,
  });
  if (!contentBoundary.ok) return { error: contentBoundary.error };

  let playCount: number;
  let likes: number;
  let comments: number;
  let shares: number;
  let favorites: number;
  let followerGain: number;
  try {
    playCount = parseRequiredNumber(String(formData.get("play_count") ?? ""), "play_count");
    likes = parseRequiredNumber(String(formData.get("likes") ?? ""), "likes");
    comments = parseRequiredNumber(String(formData.get("comments") ?? ""), "comments");
    shares = parseRequiredNumber(String(formData.get("shares") ?? ""), "shares");
    favorites = parseRequiredNumber(String(formData.get("favorites") ?? ""), "favorites");
    followerGain = parseRequiredNumber(String(formData.get("follower_gain") ?? ""), "follower_gain");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "数字字段解析失败" };
  }
  if (followerGain < 0) return { error: "涨粉数不能小于 0" };

  const parseOptionalMetric = (key: string) => parseNullableMetricInput(String(formData.get(key) ?? ""));
  const metricBoundary = validateReportMetricBoundaries({
    play_count: playCount,
    likes,
    comments,
    shares,
    favorites,
    follower_gain: followerGain,
    follower_convert: parseOptionalMetric("follower_convert"),
    avg_play_duration: parseOptionalMetric("avg_play_duration"),
    bounce_rate_2s: parseOptionalMetric("bounce_rate_2s"),
    completion_rate_5s: parseOptionalMetric("completion_rate_5s"),
    completion_rate: parseOptionalMetric("completion_rate"),
  });
  if (!metricBoundary.ok) return { error: metricBoundary.error };

  const assignees: Record<AssigneeFormField, string | null> = {
    script_author_user_id: null,
    video_editor_user_id: null,
    operator_user_id: null,
  };
  for (const field of ASSIGNEE_FORM_FIELDS) {
    if (!formData.has(field)) return { error: "岗位责任人未完整提交，请重新打开修改" };
    const value = String(formData.get(field) ?? "").trim();
    if (value && !isUuidLike(value)) return { error: "岗位责任人格式不正确，请重新打开修改" };
    assignees[field] = value || null;
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, profile_id")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) return { error: "账号读取失败，请重新打开修改" };

  const { data: report, error: reportError } = await supabase
    .from("daily_reports")
    .select("id, user_id, account_id, report_date, video_id, published_at, is_void, script_author_user_id, video_editor_user_id, operator_user_id")
    .eq("id", reportId)
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (reportError) return { error: "日报读取失败，请重新打开修改" };

  const accessError = resolveDailyReportOnlyEditAccessError({
    actorId: user.id,
    accountId,
    reportId,
    reportDate,
    account,
    report,
  });
  if (accessError || !report) return { error: accessError ?? "日报不存在，请重新打开修改" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, membership_status, team_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile || !isActiveTeamMembership(profile)) {
    return { error: "当前账号暂不能修改日报" };
  }

  const changedExternalAssigneeIds = findChangedExternalDailyReportAssigneeIds({
    assignees,
    originalAssignees: {
      script_author_user_id: report.script_author_user_id,
      video_editor_user_id: report.video_editor_user_id,
      operator_user_id: report.operator_user_id,
    },
    actorId: user.id,
  });
  if (changedExternalAssigneeIds.length > 0) {
    const { data: members, error: memberError } = await supabase
      .from("profiles")
      .select("id, team_id, membership_status")
      .in("id", changedExternalAssigneeIds);
    const validIds = new Set((members ?? [])
      .filter((member) => member.team_id === profile.team_id && member.membership_status === "active")
      .map((member) => member.id));
    if (memberError || changedExternalAssigneeIds.some((id) => !validIds.has(id))) {
      return { error: "责任人必须是当前团队中的在职成员" };
    }
  }

  const withUnit = (key: string, unit: string) => {
    const value = parseOptionalMetric(key);
    return value === null ? null : `${value}${unit}`;
  };
  const { error: rpcError } = await createAdminClient().rpc("update_history_report_edit_atomic", {
    p_report_id: reportId,
    p_actor_id: user.id,
    p_video_id: null,
    p_title: title,
    p_content: content,
    // 已保存发布时间是事实字段，编辑请求不接受浏览器改写。
    p_published_at: report.published_at,
    p_uploaded_at: new Date().toISOString(),
    p_submitter: profile.name ?? "未知",
    p_play_count: playCount,
    p_likes: likes,
    p_comments: comments,
    p_shares: shares,
    p_favorites: favorites,
    p_follower_gain: followerGain,
    p_follower_convert: parseOptionalMetric("follower_convert"),
    p_completion_rate: withUnit("completion_rate", "%"),
    p_avg_play_duration: withUnit("avg_play_duration", "秒"),
    p_bounce_rate_2s: withUnit("bounce_rate_2s", "%"),
    p_completion_rate_5s: withUnit("completion_rate_5s", "%"),
    p_script_author_user_id: assignees.script_author_user_id,
    p_video_editor_user_id: assignees.video_editor_user_id,
    p_operator_user_id: assignees.operator_user_id,
    p_touch_assignees: true,
  });
  if (rpcError) {
    return { error: resolveHistoryEditRpcErrorMessage(rpcError, "修改没能保存，请稍后重试") };
  }

  revalidatePath("/dashboard");
  return { success: true, isUpdate: true, snapshotSyncStatus: "not_applicable" as const };
}

export interface SubmitExemptionRequestInput {
  mode: GrantMode;
  category: ExemptionCategory;
  reason: string;
  dateReasons?: Record<string, string>;
  dates?: string[];
  startDate?: string;
  endDate?: string;
}

export interface SubmitExemptionRequestResult {
  success?: boolean;
  error?: string;
  submittedDates?: string[];
}

interface ExemptionSubmitContext {
  supabase: Pick<SupabaseClient, "from">;
  user: Pick<User, "id" | "user_metadata">;
}

interface ExemptionSubmitOptions {
  today?: string;
}

const PENDING_EXEMPTION_REQUEST_ERROR = "申请正在提交中，请稍候";

// 同一运行实例内挡住两次并发点击；跨实例仍依赖数据库侧后续唯一约束。
const activeExemptionSubmissions = new Set<string>();

/**
 * 可测试的 dashboard 豁免申请核心。Server Action 只负责鉴权和缓存失效，
 * 这样分类、pending 防重和失败结果可以直接用小型 Supabase fake 回归。
 */
export async function submitExemptionRequestWithClient(
  input: SubmitExemptionRequestInput,
  context: ExemptionSubmitContext,
  options: ExemptionSubmitOptions = {},
): Promise<SubmitExemptionRequestResult> {
  const { supabase, user } = context;

  if (activeExemptionSubmissions.has(user.id)) {
    return { error: PENDING_EXEMPTION_REQUEST_ERROR };
  }

  activeExemptionSubmissions.add(user.id);

  try {
    if (input.category !== "leave" && input.category !== "waive") {
      return { error: "申请类型不正确" };
    }

    if (!input.reason?.trim()) {
      return { error: "申请原因还没填" };
    }

    const today = options.today ?? formatShanghaiDateOnly();
    const { data: applicantProfile, error: applicantProfileError } = await supabase
      .from("profiles")
      .select("team_id, membership_status")
      .eq("id", user.id)
      .maybeSingle();

    if (applicantProfileError || !applicantProfile || !isActiveTeamMembership(applicantProfile)) {
      console.error("[exemptions] missing team_id for user", user.id);
      return { error: TEAM_MEMBERSHIP_REQUIRED_MESSAGE };
    }

    const teamId = applicantProfile.team_id;

    let drafts;
    try {
      drafts =
        input.dates && input.dates.length > 0
          ? buildRequestDraftsForDates({
              applicantUserId: user.id,
              teamId,
              category: input.category,
              reason: input.reason,
              dateReasons: input.dateReasons,
              dates: input.dates,
              today,
            })
          : [
              buildRequestDraft({
                applicantUserId: user.id,
                teamId,
                mode: input.mode,
                category: input.category,
                reason: input.reason,
                today,
                startDate: input.startDate,
                endDate: input.endDate,
              }),
            ];
    } catch (error) {
      return { error: error instanceof Error ? error.message : "申请日期不正确" };
    }

    // 防重口径与 REST API 对齐：只拦日期重叠，不拦「有任意 pending 就禁止再申请」
    const precheck = await checkPendingExemptionOverlap(supabase, {
      applicantUserId: user.id,
      category: input.category,
      ranges: drafts,
    });
    if (!precheck.ok) {
      console.error(
        precheck.stage === "requests"
          ? "[exemptions] failed to check pending dashboard request"
          : "[exemptions] failed to check pending dashboard request dates",
        { error: precheck.error, userId: user.id },
      );
      return { error: "暂时无法确认申请状态，请稍后重试" };
    }

    const { overlappingDates } = precheck;
    if (overlappingDates.length > 0) {
      return {
        error: `以下日期已有申请在审批中：${overlappingDates.join("、")}。这些日期请等审批完成，其他日期仍可提交。`,
      };
    }

    const writeResult = await writePendingExemptionRequests(supabase, drafts);
    if (!writeResult.ok) {
      const error = writeResult.error as { code?: string; message: string };
      console.error("[exemptions] failed to submit dashboard request", {
        error,
        userId: user.id,
        teamId,
        draftCount: drafts.length,
      });

      // 分类字段缺失时不能降级为默认 waive，否则 leave 会被静默改义。
      if (isMissingExemptionRequestCategoryError(error)) {
        return { error: "申请分类字段未就绪，请联系管理员" };
      }

      if (error.code === "23P01" || error.code === "23505") {
        return { error: "已有重叠的待处理申请，请刷新后重试" };
      }

      return { error: "提交豁免申请失败" };
    }

    return {
      success: true,
      submittedDates: drafts.map((draft) => draft.start_date),
    };
  } catch (error) {
    console.error("[exemptions] dashboard request threw", { error, userId: user.id });
    return { error: "豁免申请没能交上去，请稍后再试" };
  } finally {
    activeExemptionSubmissions.delete(user.id);
  }
}

export async function submitExemptionRequest(
  input: SubmitExemptionRequestInput,
): Promise<SubmitExemptionRequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const result = await submitExemptionRequestWithClient(input, { supabase, user });
  if (!result.error) revalidatePath("/dashboard");
  return result;
}

export async function updateProfile(name: string) {
  return updateProfileAction(name);
}

export async function createAccount(name: string, contentDirection?: string, remark?: string) {
  return createAccountAction(name, contentDirection, remark);
}

export async function updateAccountName(accountId: string, newName: string) {
  return updateAccountNameAction(accountId, newName);
}

export async function updateAccountRemark(accountId: string, newRemark: string) {
  return updateAccountRemarkAction(accountId, newRemark);
}
