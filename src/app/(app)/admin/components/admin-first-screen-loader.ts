import { filterScopedRows, requireAdminServiceClient, unwrapRpc } from "@/app/api/admin/cockpit/_shared";
import type { ExemptionRequestRow } from "@/app/(app)/admin/豁免申请列表";
import { listPendingRequestsForAdmin, type AdminRequestRow } from "@/lib/team-join/service";
import type { DataAccessScope } from "@/lib/data-access-scope";

export type CockpitSummary = {
  pending_videos: number;
  pending_violations: number;
  pending_submissions: number;
  pending_exemptions: number;
};

export type PendingVideoRow = {
  id: string;
  account_name: string;
  report_date: string;
  has_tags: boolean;
  anomaly_flag: boolean;
  submitted_by: string | null;
  submitted_by_name: string | null;
};

export type PendingViolationRow = {
  id: string;
  script_text: string;
  category: string | null;
  risk_level: string | null;
  created_at: string;
  submitted_by?: string | null;
  submitted_by_name: string | null;
};

export type PendingSubmissionRow = {
  profile_id: string;
  name: string;
  team_id: string | null;
  team_name: string | null;
  last_report_date: string | null;
};

export type AdminFirstScreenData = {
  summary: CockpitSummary | null;
  pendingVideos: PendingVideoRow[];
  pendingViolations: PendingViolationRow[];
  pendingSubmissions: PendingSubmissionRow[];
  pendingExemptions: ExemptionRequestRow[];
  pendingJoinRequests: AdminRequestRow[];
};

type AdminFirstScreenDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  listPendingRequestsForAdmin: typeof listPendingRequestsForAdmin;
  loadPendingViolationRows: typeof loadPendingViolationRows;
  loadPendingExemptionRows: typeof loadPendingExemptionRows;
};

const defaultDeps: AdminFirstScreenDeps = {
  requireAdminServiceClient,
  listPendingRequestsForAdmin,
  loadPendingViolationRows,
  loadPendingExemptionRows,
};

function createEmptyAdminFirstScreenData(): AdminFirstScreenData {
  return {
    summary: null,
    pendingVideos: [],
    pendingViolations: [],
    pendingSubmissions: [],
    pendingExemptions: [],
    pendingJoinRequests: [],
  };
}

function normalizeSummary(value: Record<string, number> | null | undefined): CockpitSummary {
  return {
    pending_videos: Number(value?.pending_videos ?? 0),
    pending_violations: Number(value?.pending_violations ?? 0),
    pending_submissions: Number(value?.pending_submissions ?? 0),
    pending_exemptions: Number(value?.pending_exemptions ?? 0),
  };
}

function buildScopedSummary(
  value: Record<string, number> | null | undefined,
  rows: {
    pendingVideos: PendingVideoRow[];
    pendingViolations: PendingViolationRow[];
    pendingSubmissions: PendingSubmissionRow[];
  },
): CockpitSummary {
  const summary = normalizeSummary(value);
  return {
    ...summary,
    pending_videos: rows.pendingVideos.length,
    pending_violations: rows.pendingViolations.length,
    pending_submissions: rows.pendingSubmissions.length,
  };
}

export async function loadAdminFirstScreenData(
  date: string,
  deps: AdminFirstScreenDeps = defaultDeps,
): Promise<AdminFirstScreenData> {
  const auth = await deps.requireAdminServiceClient();
  if ("response" in auth) {
    return createEmptyAdminFirstScreenData();
  }

  const [
    summaryResult,
    videosResult,
    violationsResult,
    submissionsResult,
    exemptionsResult,
    joinRequestsResult,
  ] = await Promise.all([
    auth.supabase.rpc("admin_cockpit_summary", { target_date: date }),
    auth.supabase.rpc("admin_pending_videos_today", { target_date: date, limit_rows: 10 }),
    deps.loadPendingViolationRows(auth.supabase, auth.scope),
    auth.supabase.rpc("admin_pending_submissions_today", { target_date: date }),
    deps.loadPendingExemptionRows(auth.supabase),
    deps.listPendingRequestsForAdmin(),
  ]);

  const summary = unwrapRpc<Record<string, number>>(summaryResult).data;
  const pendingVideos = filterScopedRows(auth.scope, unwrapRpc<PendingVideoRow[]>(videosResult).data, (row) => row.submitted_by);
  const pendingSubmissions = filterScopedRows(auth.scope, unwrapRpc<PendingSubmissionRow[]>(submissionsResult).data, (row) => row.profile_id);
  const pendingJoinRequests = joinRequestsResult.ok ? joinRequestsResult.data : [];

  return {
    summary: buildScopedSummary(summary, {
      pendingVideos,
      pendingViolations: violationsResult,
      pendingSubmissions,
    }),
    pendingVideos,
    pendingViolations: violationsResult,
    pendingSubmissions,
    pendingExemptions: exemptionsResult,
    pendingJoinRequests,
  };
}

type AdminSupabase = Awaited<ReturnType<typeof requireAdminServiceClient>> extends infer R
  ? R extends { supabase: infer S }
    ? S
    : never
  : never;

async function loadPendingViolationRows(
  supabase: AdminSupabase,
  scope: DataAccessScope,
): Promise<PendingViolationRow[]> {
  let query = supabase
    .from("violation_cases")
    .select("id, script_text, category, risk_level, created_at, submitted_by, profiles!submitted_by(name)")
    .eq("status", "submitted")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(10);

  if (scope.kind !== "all") {
    query = query.in("submitted_by", scope.visibleUserIds);
  }

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    script_text:
      typeof row.script_text === "string" && row.script_text.length > 80
        ? row.script_text.slice(0, 80)
        : (row.script_text as string),
    category: (row.category as string | null) ?? null,
    risk_level: (row.risk_level as string | null) ?? null,
    created_at: row.created_at as string,
    submitted_by: (row.submitted_by as string | null) ?? null,
    submitted_by_name: (() => {
      const profiles = row.profiles as { name?: string | null } | Array<{ name?: string | null }> | null;
      const profile = Array.isArray(profiles) ? profiles[0] : profiles;
      return profile?.name ?? "未命名成员";
    })(),
  }));
}

async function loadPendingExemptionRows(
  supabase: AdminSupabase,
): Promise<ExemptionRequestRow[]> {
  try {
    const { data: requests } = await supabase
      .from("exemption_request")
      .select("id, applicant_user_id, exemption_type, exemption_category, reason, created_at")
      .eq("request_status", "pending")
      .order("created_at", { ascending: false })
      .limit(8);

    if (!requests || requests.length === 0) return [];

    const userIds = Array.from(new Set(requests.map((r) => r.applicant_user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", userIds);

    const nameMap = new Map((profiles ?? []).map((p) => [p.id as string, p.name as string]));

    return requests.map((r) => ({
      id: r.id as string,
      applicant_user_id: r.applicant_user_id as string,
      applicant_name: nameMap.get(r.applicant_user_id as string) ?? "未知成员",
      exemption_type: r.exemption_type as string,
      exemption_category: (r.exemption_category as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      created_at: r.created_at as string,
    }));
  } catch {
    return [];
  }
}
