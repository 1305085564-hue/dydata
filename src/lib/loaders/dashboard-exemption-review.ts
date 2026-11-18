import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingExemptionRequestCategoryError } from "@/lib/豁免流程";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";

/** 审批结果在工作台保留的天数：员工隔几天才打开也能看到结果和驳回理由。 */
export const EXEMPTION_REVIEW_NOTICE_DAYS = 7;
const MAX_REQUESTS = 20;
const DAY_MS = 86_400_000;

export type UserExemptionReviewNotice = {
  id: string;
  request_status: "approved" | "rejected" | "pending";
  exemption_type: string;
  exemption_category: "waive" | "leave" | null;
  start_date: string | null;
  end_date: string | null;
  reason: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  daily_results?: Array<{
    date: string;
    status: "pending" | "approved" | "rejected";
    feedback: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
  }>;
};

export type ReviewNoticeRequestRow = Omit<UserExemptionReviewNotice, "daily_results">;
export type ReviewNoticeDailyRow = {
  request_id: string;
  request_date: string;
  status: "pending" | "approved" | "rejected";
  feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

const REQUEST_COLUMNS = "id, request_status, exemption_type, exemption_category, start_date, end_date, reason, reviewed_at, created_at";
// 旧库没有 exemption_category 列时回退，分类按普通豁免处理
const REQUEST_COLUMNS_LEGACY = "id, request_status, exemption_type, start_date, end_date, reason, reviewed_at, created_at";
const DAILY_COLUMNS = "request_id, request_date, status, feedback, reviewed_by, reviewed_at";

function timeOf(value: string | null | undefined) {
  const ts = Date.parse(value ?? "");
  return Number.isNaN(ts) ? null : ts;
}

/**
 * 从申请与逐日明细里挑出「近 7 天内有审批结果」的申请，最新在前。
 * 已结单按处理时间；整单仍 pending 的部分批准单，要有已处理的日期且处理时间在窗口内才算。
 * 不再按「涉及日期是否早于今天」隐藏：过去日期的请假被驳回，员工同样需要看到结果和理由。
 */
export function pickRecentReviewNotices(
  requests: readonly ReviewNoticeRequestRow[],
  details: readonly ReviewNoticeDailyRow[],
  now: Date = new Date(),
): UserExemptionReviewNotice[] {
  const cutoff = now.getTime() - EXEMPTION_REVIEW_NOTICE_DAYS * DAY_MS;
  const result: Array<{ notice: UserExemptionReviewNotice; latest: number }> = [];
  for (const request of requests) {
    const dailyResults = details
      .filter((row) => row.request_id === request.id)
      .map((row) => ({ date: row.request_date, status: row.status, feedback: row.feedback, reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at }))
      .sort((left, right) => left.date.localeCompare(right.date));
    const reviewedDaily = dailyResults.filter((item) => item.status !== "pending");
    if (request.request_status === "pending" && reviewedDaily.length === 0) continue;
    const times = [
      ...reviewedDaily.map((item) => timeOf(item.reviewed_at)),
      request.request_status === "pending" ? null : timeOf(request.reviewed_at),
    ].filter((ts): ts is number => ts !== null);
    const latest = times.length > 0 ? Math.max(...times) : null;
    if (latest === null || latest < cutoff) continue;
    result.push({ notice: { ...request, ...(dailyResults.length > 0 ? { daily_results: dailyResults } : {}) }, latest });
  }
  return result.sort((left, right) => right.latest - left.latest).map((item) => item.notice);
}

/** 员工在工作台看到的近 7 天审批结果（请假/免交），每条申请一项，含逐日结果与驳回理由。 */
export async function loadRecentExemptionReviewNotices(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<UserExemptionReviewNotice[]> {
  const cutoffIso = new Date(now.getTime() - EXEMPTION_REVIEW_NOTICE_DAYS * DAY_MS).toISOString();
  const fetchRequests = (columns: string) => Promise.all([
    supabase.from("exemption_request").select(columns).eq("applicant_user_id", userId)
      .in("request_status", ["approved", "rejected"]).gte("reviewed_at", cutoffIso)
      .order("reviewed_at", { ascending: false }).limit(MAX_REQUESTS),
    // 部分批准/驳回的申请整单仍是 pending，要单独回看
    supabase.from("exemption_request").select(columns).eq("applicant_user_id", userId)
      .eq("request_status", "pending").order("created_at", { ascending: false }).limit(MAX_REQUESTS),
  ]);

  let [settled, pending] = await fetchRequests(REQUEST_COLUMNS);
  const legacy = isMissingExemptionRequestCategoryError(settled.error) || isMissingExemptionRequestCategoryError(pending.error);
  if (legacy) [settled, pending] = await fetchRequests(REQUEST_COLUMNS_LEGACY);
  assertSupabaseQuerySucceeded(settled.error, "加载豁免审批通知失败");
  assertSupabaseQuerySucceeded(pending.error, "加载豁免审批通知失败");

  const requests = ([...(settled.data ?? []), ...(pending.data ?? [])] as unknown as ReviewNoticeRequestRow[])
    .map((row) => ({ ...row, exemption_category: legacy ? "waive" as const : row.exemption_category ?? null }));
  if (requests.length === 0) return [];

  const details = await supabase.from("exemption_request_date").select(DAILY_COLUMNS)
    .in("request_id", requests.map((row) => row.id)).order("request_date", { ascending: true });
  // 明细读不到时只能展示已结单的整单结果，部分批准单无从判断就不展示（与旧行为一致）
  return pickRecentReviewNotices(requests, details.error ? [] : (details.data ?? []) as unknown as ReviewNoticeDailyRow[], now);
}
