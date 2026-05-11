import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodaySubmissionReportLike } from "@/app/(app)/dashboard/video-submit-panel-state";
import type { DashboardActivityReport } from "@/lib/loaders/dashboard-activity";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getExemptionStateForDate,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
import { ensureDefaultDashboardAccount } from "@/lib/dashboard-account-provisioning";
import { isMissingExemptionRequestCategoryError } from "@/lib/豁免流程";
import { formatShanghaiDateOnly, getSafeAccountDisplayName, uniqueNonEmpty } from "./shared";

type DashboardSupabase = SupabaseClient;

type DashboardAccountRow = {
  id: string;
  name: string;
  content_direction: string | null;
};

type ProfileWithExemptionRow = {
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
  request_status: "approved" | "rejected";
  exemption_type: string;
  exemption_category: "waive" | "leave" | null;
  start_date: string | null;
  end_date: string | null;
  reason: string | null;
  reviewed_at: string | null;
  created_at: string | null;
};

export type DashboardReviewRequest = {
  id: string;
  applicant_user_id: string;
  applicant_name: string;
  exemption_type: string;
  exemption_category: "waive" | "leave" | null;
  start_date: string | null;
  end_date: string | null;
  reason: string | null;
  created_at: string;
};

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
    .select("name, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason")
    .eq("id", userId)
    .single();

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
    .select("name, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category")
    .eq("id", userId)
    .single();

  if (!isMissingProfileExemptionCategoryError(primary.error)) {
    profileExemptionCategoryAvailable = true;
    return (primary.data as ProfileWithExemptionRow | null) ?? null;
  }

  profileExemptionCategoryAvailable = false;
  return loadDashboardProfileWithoutCategory(supabase, userId);
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
    exemptionGrantTableAvailable = true;
    return (primary.data ?? []) as ExemptionGrantLike[];
  }

  exemptionGrantTableAvailable = false;
  return loadApprovedRequestGrantsFallback(supabase, userId);
}

async function loadHasPendingExemptionRequest(supabase: DashboardSupabase, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("exemption_request")
    .select("id")
    .eq("applicant_user_id", userId)
    .eq("request_status", "pending")
    .limit(1);

  return (data?.length ?? 0) > 0;
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
    return (primary.data as UserExemptionReviewNotice | null) ?? null;
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

  if (!fallback.data) return null;

  return {
    ...(fallback.data as Omit<UserExemptionReviewNotice, "exemption_category">),
    exemption_category: "waive",
  };
}

export interface DashboardPageData {
  today: string;
  isExternalUser: boolean;
  monthSubmittedDates: string[];
  monthReports: DashboardActivityReport[];
  userId: string;
  userDisplayName: string;
  accounts: Array<DashboardAccountRow & { display_name: string }>;
  accountIds: string[];
  accountDisplayNameMap: Record<string, string>;
  ownContentDirections: string[];
  todayReports: TodaySubmissionReportLike[];
  history: DashboardActivityReport[];
  hasPendingExemption: boolean;
  userExemptionReviewNotice: UserExemptionReviewNotice | null;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  teamReviewRequests: DashboardReviewRequest[];
  summary: {
    totalAccounts: number;
    submittedCount: number;
    pendingCount: number;
    historyCount: number;
  };
}

export async function loadDashboardPageData({
  supabase,
  userId,
}: {
  supabase: DashboardSupabase;
  userId: string;
}): Promise<DashboardPageData> {
  const [accountsResult, profile] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, content_direction")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true }),
    loadDashboardProfile(supabase, userId),
  ]);

  const accounts = accountsResult.data;
  const userDisplayName = profile?.name?.trim() || "当前用户";

  if (!accounts || accounts.length === 0) {
    try {
      await ensureDefaultDashboardAccount({
        adminSupabase: supabase as never,
        profileId: userId,
        preferredName: userDisplayName,
      });
    } catch {
      // 兜底失败就继续空态，让前端明确提示“联系管理员分配账号”
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
  const ownContentDirections = uniqueNonEmpty(displayAccounts.map((account) => account.content_direction));
  const accountDisplayNameMap = Object.fromEntries(displayAccounts.map((account) => [account.id, account.display_name]));
  const adminSupabase = createAdminClient();
  const { data: currentProfileScope } = await adminSupabase
    .from("profiles")
    .select("role, permissions, team_id")
    .eq("id", userId)
    .maybeSingle();
  const currentRole = currentProfileScope?.role ?? "member";
  const currentPermissions = (currentProfileScope?.permissions ?? {}) as Record<string, boolean>;
  const currentTeamId = typeof currentProfileScope?.team_id === "string" ? currentProfileScope.team_id : null;
  const canReviewTeamRequests =
    currentRole === "owner" ||
    (currentRole === "admin" && currentPermissions.manage_members === true);

  const [
    { data: rawTodayReports },
    userExemptionGrants,
    hasPendingExemption,
    userExemptionReviewNotice,
    { data: teamReviewRequestRows },
  ] = await Promise.all([
    accountIds.length
      ? supabase
          .from("daily_reports")
          .select(
            "id, account_id, title, report_date, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at"
          )
          .in("account_id", accountIds)
          .eq("report_date", today)
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    loadUserExemptionGrants(supabase, userId),
    loadHasPendingExemptionRequest(supabase, userId),
    loadLatestExemptionReviewNotice(supabase, userId),
    canReviewTeamRequests
      ? adminSupabase
          .from("exemption_request")
          .select("id, applicant_user_id, team_id, exemption_type, exemption_category, start_date, end_date, reason, created_at, profiles:applicant_user_id(name, team_id)")
          .eq("request_status", "pending")
          .neq("applicant_user_id", userId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const todayReports = ((rawTodayReports ?? []) as TodaySubmissionReportLike[]).filter(
    (report) => typeof report.account_id === "string",
  );
  const submittedAccountIds = new Set(todayReports.map((report) => report.account_id).filter(Boolean));

  const todayExemptionState = getExemptionStateForDate(
    userExemptionProfile,
    today,
    userExemptionGrants,
  );
  const submittedCountForSummary =
    todayExemptionState.isExempt && todayExemptionState.category !== "leave"
      ? displayAccounts.length
      : submittedAccountIds.size;
  const pendingCountForSummary = todayExemptionState.isExempt
    ? 0
    : Math.max(displayAccounts.length - submittedAccountIds.size, 0);
  const teamReviewRequests = ((teamReviewRequestRows ?? []) as Array<{
    id: string;
    applicant_user_id: string;
    exemption_type: string;
    exemption_category?: "waive" | "leave" | null;
    start_date: string | null;
    end_date: string | null;
    reason: string | null;
    created_at: string;
    profiles?: { name: string | null; team_id?: string | null } | { name: string | null; team_id?: string | null }[] | null;
    team_id?: string | null;
  }>)
    .filter((request) => {
      if (currentRole === "owner" || currentPermissions.manage_members === true) return true;
      const profile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles;
      return Boolean(currentTeamId) && (request.team_id ?? profile?.team_id ?? null) === currentTeamId;
    })
    .map((request) => {
      const profile = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles;
      return {
        id: request.id,
        applicant_user_id: request.applicant_user_id,
        applicant_name: profile?.name?.trim() || "未知成员",
        exemption_type: request.exemption_type,
        exemption_category: request.exemption_category ?? "waive",
        start_date: request.start_date,
        end_date: request.end_date,
        reason: request.reason,
        created_at: request.created_at,
      };
    });

  return {
    today,
    isExternalUser: false,
    monthSubmittedDates: [],
    monthReports: [],
    userId,
    userDisplayName,
    accounts: displayAccounts,
    accountIds,
    accountDisplayNameMap,
    ownContentDirections,
    todayReports,
    history: [],
    hasPendingExemption,
    userExemptionReviewNotice,
    userExemptionProfile,
    userExemptionGrants,
    teamReviewRequests,
    summary: {
      totalAccounts: displayAccounts.length,
      submittedCount: submittedCountForSummary,
      pendingCount: pendingCountForSummary,
      historyCount: 0,
    },
  };
}
