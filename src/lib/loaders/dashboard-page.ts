import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodaySubmissionReportLike } from "@/app/(app)/dashboard/video-submit-panel-state";
import {
  DASHBOARD_REPORT_SELECT,
  type DashboardActivityReport,
} from "@/lib/loaders/dashboard-activity";
import {
  getDashboardSubmittedDates,
  isDashboardReport,
  mergeDashboardReports,
} from "@/app/(app)/dashboard/video-submit-panel-state";
import {
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
import { ensureDefaultDashboardAccount } from "@/lib/dashboard-account-provisioning";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { isMissingExemptionRequestCategoryError } from "@/lib/豁免流程";
import { formatShanghaiDateOnly, getSafeAccountDisplayName, shiftDateOnly } from "./shared";

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

const DASHBOARD_PROFILE_SELECT =
  "name, team_id, membership_status, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category";
const DASHBOARD_PROFILE_SELECT_FALLBACK =
  "name, team_id, membership_status, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason";

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
    .select("start_date, end_date")
    .eq("applicant_user_id", userId)
    .eq("request_status", "pending")
    .limit(200);

  assertSupabaseQuerySucceeded(error, "加载待审批豁免失败");

  return expandPendingExemptionRequestDates(
    (data ?? []) as Array<{ start_date: string | null; end_date: string | null }>,
  );
}

// 单行区间展开上限，防止异常数据把日期集合撑爆
const MAX_PENDING_REQUEST_RANGE_DAYS = 400;

function expandPendingExemptionRequestDates(
  rows: Array<{ start_date: string | null; end_date: string | null }>,
): string[] {
  const dates = new Set<string>();
  for (const row of rows) {
    if (!row.start_date) continue;
    const start = row.start_date;
    const end = row.end_date && row.end_date >= start ? row.end_date : start;
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    const dayCount = Math.min(
      Math.floor((endMs - startMs) / 86_400_000) + 1,
      MAX_PENDING_REQUEST_RANGE_DAYS,
    );
    for (let index = 0; index < dayCount; index += 1) {
      dates.add(new Date(startMs + index * 86_400_000).toISOString().slice(0, 10));
    }
  }
  return Array.from(dates).sort();
}

function latestDailyReviewTime(dailyResults: UserExemptionReviewNotice["daily_results"]): number | null {
  let latest: number | null = null;
  for (const item of dailyResults ?? []) {
    if (!item.reviewed_at) continue;
    const ts = Date.parse(item.reviewed_at);
    if (!Number.isNaN(ts) && (latest === null || ts > latest)) latest = ts;
  }
  return latest;
}

async function loadLatestExemptionReviewNotice(
  supabase: DashboardSupabase,
  userId: string,
): Promise<UserExemptionReviewNotice | null> {
  const primary = await supabase
    .from("exemption_request")
    .select("id, request_status, exemption_type, exemption_category, start_date, end_date, reason, reviewed_at, created_at")
    .eq("applicant_user_id", userId)
    .in("request_status", ["approved", "rejected"])
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!isMissingExemptionRequestCategoryError(primary.error)) {
    assertSupabaseQuerySucceeded(primary.error, "加载豁免审批通知失败");
    const primaryNotice = primary.data ? (primary.data as UserExemptionReviewNotice) : null;

    // 部分批准/部分拒绝的申请 request_status 仍为 pending，只查已结单会漏掉更新的逐日结果。
    // 因此同时回看最近的 pending 单，取存在已处理日期明细的一条，再与已结单比较新旧。
    const partial = await supabase
      .from("exemption_request")
      .select("id, request_status, exemption_type, exemption_category, start_date, end_date, reason, reviewed_at, created_at")
      .eq("applicant_user_id", userId)
      .eq("request_status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);
    if (partial.error && !isMissingExemptionRequestCategoryError(partial.error)) {
      assertSupabaseQuerySucceeded(partial.error, "加载豁免审批通知失败");
    }
    let partialNotice: UserExemptionReviewNotice | null = null;
    for (const row of (partial.data ?? []) as UserExemptionReviewNotice[]) {
      try {
        const details = await supabase.from("exemption_request_date").select("request_date, status, feedback, reviewed_by, reviewed_at").eq("request_id", row.id).order("request_date", { ascending: true });
        if (details.error) continue;
        const dailyResults = (details.data ?? []).map((item) => ({ date: item.request_date, status: item.status, feedback: item.feedback, reviewed_by: item.reviewed_by, reviewed_at: item.reviewed_at }));
        if (dailyResults.some((item) => item.status !== "pending")) {
          partialNotice = { ...row, daily_results: dailyResults };
          break;
        }
      } catch {
        continue;
      }
    }

    // 已结单与部分批准单都可能存在，按最近处理时间取新的一条展示。
    const withDetails = async (notice: UserExemptionReviewNotice): Promise<UserExemptionReviewNotice> => {
      try {
        const details = await supabase.from("exemption_request_date").select("request_date, status, feedback, reviewed_by, reviewed_at").eq("request_id", notice.id).order("request_date", { ascending: true });
        if (details.error) return notice;
        return { ...notice, daily_results: (details.data ?? []).map((row) => ({ date: row.request_date, status: row.status, feedback: row.feedback, reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at })) };
      } catch {
        return notice;
      }
    };

    if (primaryNotice && partialNotice) {
      const primaryTime = Date.parse(primaryNotice.reviewed_at || primaryNotice.created_at || "");
      const partialTime = latestDailyReviewTime(partialNotice.daily_results) ?? Date.parse(partialNotice.created_at || "");
      if (partialTime > primaryTime) return partialNotice;
      return withDetails(primaryNotice);
    }
    if (primaryNotice) return withDetails(primaryNotice);
    return partialNotice;
  }

  const fallback = await supabase
    .from("exemption_request")
    .select("id, request_status, exemption_type, start_date, end_date, reason, reviewed_at, created_at")
    .eq("applicant_user_id", userId)
    .in("request_status", ["approved", "rejected"])
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  assertSupabaseQuerySucceeded(fallback.error, "加载豁免审批通知失败");

  if (!fallback.data) return null;

  let dailyResults: UserExemptionReviewNotice["daily_results"] = undefined;
  try {
    const details = await supabase.from("exemption_request_date").select("request_date, status, feedback, reviewed_by, reviewed_at").eq("request_id", fallback.data.id).order("request_date", { ascending: true });
    if (!details.error) dailyResults = (details.data ?? []).map((row) => ({ date: row.request_date, status: row.status, feedback: row.feedback, reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at }));
  } catch {
    dailyResults = undefined;
  }
  return {
    ...(fallback.data as Omit<UserExemptionReviewNotice, "exemption_category">),
    exemption_category: "waive",
    daily_results: dailyResults,
  };
}

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
  userExemptionReviewNotice: UserExemptionReviewNotice | null;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
}

export async function loadDashboardPageData({
  supabase,
  userId,
}: {
  supabase: DashboardSupabase;
  userId: string;
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
  const sixtyDaysAgo = shiftDateOnly(new Date(), -60);

  const [
    todayReportsResult,
    monthReportsResult,
    recentDatesResult,
    userExemptionGrants,
    pendingExemptionDates,
    userExemptionReviewNotice,
  ] = await Promise.all([
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(DASHBOARD_REPORT_SELECT)
          .in("account_id", accountIds)
          .eq("report_date", today)
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(DASHBOARD_REPORT_SELECT)
          .in("account_id", accountIds)
          .gte("report_date", monthStartDate)
          .lte("report_date", today)
          .order("report_date", { ascending: false })
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select("report_date")
          .in("account_id", accountIds)
          .gte("report_date", sixtyDaysAgo)
          .lte("report_date", today)
      : Promise.resolve({ data: [], error: null }),
    loadUserExemptionGrants(supabase, userId),
    loadPendingExemptionDates(supabase, userId),
    loadLatestExemptionReviewNotice(supabase, userId),
  ]);

  assertSupabaseQuerySucceeded(todayReportsResult.error, "加载今日提交记录失败");
  assertSupabaseQuerySucceeded(monthReportsResult.error, "加载本月提交记录失败");
  assertSupabaseQuerySucceeded(recentDatesResult.error, "加载近期提交日期失败");
  const rawTodayReports = todayReportsResult.data;

  const todayReports = ((rawTodayReports ?? []) as TodaySubmissionReportLike[]).filter(
    (report) => typeof report.account_id === "string",
  );
  const monthReports = mergeDashboardReports({
    initialReports: ((monthReportsResult.data ?? []) as Array<TodaySubmissionReportLike & { id: string }>).filter(
      isDashboardReport,
    ),
  });
  const recentSubmittedDates = ((recentDatesResult.data ?? []) as Array<{ report_date: string }>).map((r) => r.report_date).filter(Boolean);
  const monthSubmittedDates = Array.from(new Set([
    ...getDashboardSubmittedDates(monthReports),
    ...recentSubmittedDates,
  ])).sort();

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
    userExemptionReviewNotice,
    userExemptionProfile,
    userExemptionGrants,
  };
}

export const __internal = {
  DASHBOARD_PROFILE_SELECT,
  DASHBOARD_PROFILE_SELECT_FALLBACK,
};
