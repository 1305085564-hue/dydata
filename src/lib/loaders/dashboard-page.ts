import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodaySubmissionReportLike } from "@/lib/dashboard-submission-state";
import {
  DASHBOARD_REPORT_SELECT,
  type DashboardActivityReport,
} from "@/lib/loaders/dashboard-activity";
import {
  getDashboardSubmittedDates,
  isDashboardReport,
} from "@/lib/dashboard-submission-state";
import {
  getPendingExemptionDatesFromRequests,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
  type PendingExemptionDateLike,
  type PendingExemptionRequestLike,
} from "@/lib/豁免";
import { ensureDefaultDashboardAccount } from "@/lib/dashboard-account-provisioning";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { isMissingExemptionRequestCategoryError } from "@/lib/豁免流程";
import { formatShanghaiDateOnly, getSafeAccountDisplayName, shiftDateOnly } from "./shared";
import { loadRecentExemptionReviewNotices, type UserExemptionReviewNotice } from "./dashboard-exemption-review";
import { resolveDashboardFulfillmentMarks, type FulfillmentMarkRow, type MonthFulfillmentBasis } from "./dashboard-fulfillment-marks";
import { getPublishedDateKey } from "@/lib/date-semantics";

type DashboardSupabase = SupabaseClient;

type DashboardAccountRow = {
  id: string;
  name: string;
  content_direction: string | null;
};

async function loadDashboardAccounts(
  supabase: DashboardSupabase,
  userId: string,
): Promise<DashboardAccountRow[]> {
  const result = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true });

  assertSupabaseQuerySucceeded(result.error, "加载账号失败");
  return (result.data ?? []) as DashboardAccountRow[];
}

type ProfileWithExemptionRow = {
  team_id: string | null;
  membership_status: "active" | "archived" | string | null;
  name: string | null;
  status: string | null;
  exempt_type: "permanent" | "temporary" | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
  exemption_category: "waive" | "leave" | null;
  created_at?: string | null;
};

type ProfileWithoutCategoryRow = Omit<ProfileWithExemptionRow, "exemption_category">;

type ApprovedRequestGrantRow = {
  applicant_user_id: string;
  exemption_type: string;
  exemption_category?: "waive" | "leave" | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
};

const DASHBOARD_PROFILE_SELECT =
  "name, team_id, membership_status, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category, created_at";
const DASHBOARD_PROFILE_SELECT_FALLBACK =
  "name, team_id, membership_status, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, created_at";

let profileExemptionCategoryAvailable: boolean | null = null;
let exemptionGrantTableAvailable: boolean | null = null;

function isMissingProfileExemptionCategoryError(error: { message?: string } | null | undefined) {
  return Boolean(
    error?.message &&
      (error.message.includes("profiles.exemption_category") ||
        error.message.includes("column profiles.exemption_category does not exist") ||
        error.message.includes("Could not find the 'exemption_category' column of 'profiles'")),
  );
}

function isMissingExemptionGrantTableError(error: { message?: string } | null | undefined) {
  return Boolean(
    error?.message &&
      error.message.includes("public.exemption_grant") &&
      error.message.includes("schema cache"),
  );
}

async function loadDashboardProfileWithoutCategory(
  supabase: DashboardSupabase,
  userId: string,
): Promise<ProfileWithExemptionRow | null> {
  const fallback = await supabase
    .from("profiles")
    .select(DASHBOARD_PROFILE_SELECT_FALLBACK)
    .eq("id", userId)
    .single();

  assertSupabaseQuerySucceeded(fallback.error, "加载用户资料失败");

  if (!fallback.data) return null;

  return {
    ...(fallback.data as ProfileWithoutCategoryRow),
    exemption_category: null,
  };
}

async function loadDashboardProfile(
  supabase: DashboardSupabase,
  userId: string,
): Promise<ProfileWithExemptionRow | null> {
  if (profileExemptionCategoryAvailable === false) {
    return loadDashboardProfileWithoutCategory(supabase, userId);
  }

  const primary = await supabase
    .from("profiles")
    .select(DASHBOARD_PROFILE_SELECT)
    .eq("id", userId)
    .single();

  if (isMissingProfileExemptionCategoryError(primary.error)) {
    profileExemptionCategoryAvailable = false;
    return loadDashboardProfileWithoutCategory(supabase, userId);
  }

  assertSupabaseQuerySucceeded(primary.error, "加载用户资料失败");
  profileExemptionCategoryAvailable = true;
  return (primary.data as ProfileWithExemptionRow | null) ?? null;
}

async function loadApprovedRequestGrantsFallback(
  supabase: DashboardSupabase,
  userId: string,
): Promise<ExemptionGrantLike[]> {
  const primary = await supabase
    .from("exemption_request")
    .select("applicant_user_id, exemption_type, exemption_category, start_date, end_date, created_at")
    .eq("applicant_user_id", userId)
    .eq("request_status", "approved")
    .order("created_at", { ascending: false });

  if (!isMissingExemptionRequestCategoryError(primary.error)) {
    assertSupabaseQuerySucceeded(primary.error, "加载已审批豁免失败");
    return ((primary.data ?? []) as ApprovedRequestGrantRow[]).map((request) => ({
      user_id: request.applicant_user_id,
      start_date: request.start_date,
      end_date: request.end_date,
      grant_type: request.exemption_type,
      exemption_category: request.exemption_category ?? "waive",
      status: "active",
      created_at: request.created_at,
    }));
  }

  const fallback = await supabase
    .from("exemption_request")
    .select("applicant_user_id, exemption_type, start_date, end_date, created_at")
    .eq("applicant_user_id", userId)
    .eq("request_status", "approved")
    .order("created_at", { ascending: false });

  assertSupabaseQuerySucceeded(fallback.error, "加载已审批豁免失败");

  return ((fallback.data ?? []) as ApprovedRequestGrantRow[]).map((request) => ({
    user_id: request.applicant_user_id,
    start_date: request.start_date,
    end_date: request.end_date,
    grant_type: request.exemption_type,
    exemption_category: "waive",
    status: "active",
    created_at: request.created_at,
  }));
}

async function loadUserExemptionGrants(
  supabase: DashboardSupabase,
  userId: string,
): Promise<ExemptionGrantLike[]> {
  if (exemptionGrantTableAvailable === false) {
    return loadApprovedRequestGrantsFallback(supabase, userId);
  }

  const primary = await supabase
    .from("exemption_grant")
    .select("user_id, start_date, end_date, grant_type, exemption_category, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (!isMissingExemptionGrantTableError(primary.error)) {
    assertSupabaseQuerySucceeded(primary.error, "加载豁免记录失败");
    exemptionGrantTableAvailable = true;
    return (primary.data ?? []) as ExemptionGrantLike[];
  }

  exemptionGrantTableAvailable = false;
  return loadApprovedRequestGrantsFallback(supabase, userId);
}

async function loadPendingExemptionDates(supabase: DashboardSupabase, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("exemption_request")
    .select("id, start_date, end_date")
    .eq("applicant_user_id", userId)
    .eq("request_status", "pending")
    .limit(200);

  assertSupabaseQuerySucceeded(error, "加载待审批豁免失败");

  const pendingRows = (data ?? []) as PendingExemptionRequestLike[];
  const requestIds = pendingRows.map((row) => row.id).filter((id): id is string => Boolean(id));
  const detailsResult = requestIds.length > 0
    ? await supabase
        .from("exemption_request_date")
        .select("request_id, request_date, status")
        .in("request_id", requestIds)
    : { data: [] as PendingExemptionDateLike[], error: null };

  assertSupabaseQuerySucceeded(detailsResult.error, "加载待审批豁免日期失败");

  return getPendingExemptionDatesFromRequests(
    pendingRows,
    (detailsResult.data ?? []) as PendingExemptionDateLike[],
  );
}

export type { UserExemptionReviewNotice };

export interface DashboardPageData {
  today: string;
  monthSubmittedDates: string[];
  monthReports: DashboardActivityReport[];
  userId: string;
  userDisplayName: string;
  hasActiveTeamMembership: boolean;
  accounts: Array<DashboardAccountRow & { display_name: string }>;
  accountIds: string[];
  accountDisplayNameMap: Record<string, string>;
  todayReports: TodaySubmissionReportLike[];
  history: DashboardActivityReport[];
  hasPendingExemption: boolean;
  pendingExemptionDates: string[];
  absentDates: string[];
  absentReasons: Record<string, string>;
  monthFulfillmentBasis: MonthFulfillmentBasis;
  /** 近 7 天内审批过的请假/免交结果，最新在前（含逐日结果与驳回理由）。 */
  userExemptionReviewNotices: UserExemptionReviewNotice[];
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
}

export async function loadDashboardPageData({
  supabase,
  userId,
  adminSupabase,
}: {
  supabase: DashboardSupabase;
  userId: string;
  adminSupabase?: DashboardSupabase;
}): Promise<DashboardPageData> {
  const [initialAccounts, profile] = await Promise.all([
    loadDashboardAccounts(supabase, userId),
    loadDashboardProfile(supabase, userId),
  ]);

  let accounts = initialAccounts;
  const userDisplayName = profile?.name?.trim() || "当前用户";
  const hasActiveTeamMembership = profile?.membership_status === "active" && Boolean(profile.team_id);

  if (hasActiveTeamMembership && accounts.length === 0) {
    let shouldReloadAccounts = false;
    try {
      const provisioning = await ensureDefaultDashboardAccount({
        adminSupabase: supabase as never,
        profileId: userId,
        preferredName: userDisplayName,
      });
      shouldReloadAccounts = provisioning.created;
    } catch {
      // 兜底失败就继续空态，让前端明确提示“联系管理员分配账号”
    }
    if (shouldReloadAccounts) {
      accounts = await loadDashboardAccounts(supabase, userId);
    }
  }
  const userExemptionProfile: ExemptionProfileLike = {
    id: userId,
    status: profile?.status === "exempt" ? "exempt" : "active",
    exempt_type: profile?.exempt_type ?? null,
    exempt_start_date: profile?.exempt_start_date ?? null,
    exempt_end_date: profile?.exempt_end_date ?? null,
    exempt_reason: profile?.exempt_reason ?? null,
    exemption_category: profile?.exemption_category ?? null,
  };
  const displayAccounts = ((accounts ?? []) as DashboardAccountRow[]).map((account, index, list) => ({
    ...account,
    name: account.name ?? "未命名账号",
    display_name: getSafeAccountDisplayName({
      rawName: account.name,
      userDisplayName,
      contentDirection: account.content_direction,
      index,
      total: list.length,
    }),
  }));

  const today = formatShanghaiDateOnly();
  const accountIds = displayAccounts.map((account) => account.id);
  const accountDisplayNameMap = Object.fromEntries(displayAccounts.map((account) => [account.id, account.display_name]));
  const monthStartDate = `${today.slice(0, 8)}01`;
  const reportLookupStart = shiftDateOnly(new Date(`${monthStartDate}T00:00:00+08:00`), -60);
  const sixtyDaysAgo = shiftDateOnly(new Date(), -60);

  const [
    todayReportsResult,
    monthReportsResult,
    recentDatesResult,
    userExemptionGrants,
    pendingExemptionDates,
    userExemptionReviewNotices,
    absentRecordsResult,
  ] = await Promise.all([
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(DASHBOARD_REPORT_SELECT)
          .in("account_id", accountIds)
          .gte("report_date", reportLookupStart)
          .lte("report_date", today)
          .eq("is_void", false)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(DASHBOARD_REPORT_SELECT)
          .in("account_id", accountIds)
          .gte("report_date", reportLookupStart)
          .lte("report_date", today)
          .eq("is_void", false)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select("report_date, published_at")
          .in("account_id", accountIds)
          .gte("report_date", sixtyDaysAgo)
          .lte("report_date", today)
          .eq("is_void", false)
      : Promise.resolve({ data: [], error: null }),
    loadUserExemptionGrants(supabase, userId),
    loadPendingExemptionDates(supabase, userId),
    loadRecentExemptionReviewNotices(supabase, userId),
    adminSupabase
      ? adminSupabase
          .from("fulfillment_records")
          .select("record_date, status, reason")
          .eq("user_id", userId)
          .gte("record_date", reportLookupStart)
          .lte("record_date", today)
      : Promise.resolve({ data: [], error: null }),
  ]);

  assertSupabaseQuerySucceeded(todayReportsResult.error, "加载今日提交记录失败");
  assertSupabaseQuerySucceeded(monthReportsResult.error, "加载本月提交记录失败");
  assertSupabaseQuerySucceeded(recentDatesResult.error, "加载近期提交日期失败");
  assertSupabaseQuerySucceeded(absentRecordsResult.error, "加载缺勤记录失败");
  const rawTodayReports = todayReportsResult.data;

  const todayReports = ((rawTodayReports ?? []) as TodaySubmissionReportLike[]).filter(
    (report) => typeof report.account_id === "string",
  ).filter((report) => getPublishedDateKey(report) === today);
  // 保留日报行本身，不能在首屏按“账号+归属日”折叠；同一天可能有多条不同作品。
  const monthReports = ((monthReportsResult.data ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
    isDashboardReport,
  );
  const recentSubmittedDates = ((recentDatesResult.data ?? []) as Array<{ report_date: string; published_at: string | null }>)
    .map((report) => getPublishedDateKey(report))
    .filter((date): date is string => Boolean(date));
  const monthSubmittedDates = Array.from(new Set([
    ...getDashboardSubmittedDates(monthReports),
    ...recentSubmittedDates,
  ])).sort();
  const { absentDates, absentReasons, monthFulfillmentBasis } = resolveDashboardFulfillmentMarks(
    (absentRecordsResult.data ?? []) as FulfillmentMarkRow[], profile?.created_at,
  );

  return {
    today,
    monthSubmittedDates,
    monthReports,
    userId,
    userDisplayName,
    hasActiveTeamMembership,
    accounts: displayAccounts,
    accountIds,
    accountDisplayNameMap,
    todayReports,
    history: [],
    hasPendingExemption: pendingExemptionDates.length > 0,
    pendingExemptionDates,
    absentDates,
    absentReasons,
    monthFulfillmentBasis,
    userExemptionReviewNotices,
    userExemptionProfile,
    userExemptionGrants,
  };
}

export const __internal = {
  DASHBOARD_PROFILE_SELECT,
  DASHBOARD_PROFILE_SELECT_FALLBACK,
};
