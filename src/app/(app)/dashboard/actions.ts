"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { isActiveTeamMembership } from "@/app/api/topics/_shared";
import { submitExemptionRequestWithClient, type SubmitExemptionRequestInput, type SubmitExemptionRequestResult } from "./exemption-submit";
export type { SubmitExemptionRequestInput, SubmitExemptionRequestResult } from "./exemption-submit";
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
  const { supabase, user } = await getCurrentUserContext();
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

export async function submitExemptionRequest(
  input: SubmitExemptionRequestInput,
): Promise<SubmitExemptionRequestResult> {
  const { supabase, user } = await getCurrentUserContext();
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
