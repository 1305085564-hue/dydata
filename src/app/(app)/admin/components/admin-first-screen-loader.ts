import { filterScopedRows, requireAdminServiceClient, unwrapRpc } from "@/app/api/admin/cockpit/_shared";
import type { ExemptionRequestRow } from "@/app/(app)/admin/豁免申请列表";
import { listPendingRequestsForAdmin, type AdminRequestRow } from "@/lib/team-join/service";

export type CockpitSummary = {
  pending_videos: number;
  pending_submissions: number;
  pending_exemptions: number;
};

export type PendingVideoRow = {
  id: string;
  account_name: string;
  video_title: string | null;
  published_at: string | null;
  play_change_signal: "surge" | "halve";
  play_count_change_pct: number | null;
  current_play_count: number | null;
  previous_play_count: number | null;
  submitted_by: string | null;
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
  pendingSubmissions: PendingSubmissionRow[];
  pendingExemptions: ExemptionRequestRow[];
  pendingJoinRequests: AdminRequestRow[];
};

type AdminFirstScreenDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  listPendingRequestsForAdmin: typeof listPendingRequestsForAdmin;
  loadPendingExemptionRows: typeof loadPendingExemptionRows;
};

const defaultDeps: AdminFirstScreenDeps = {
  requireAdminServiceClient,
  listPendingRequestsForAdmin,
  loadPendingExemptionRows,
};

function createEmptyAdminFirstScreenData(): AdminFirstScreenData {
  return {
    summary: null,
    pendingVideos: [],
    pendingSubmissions: [],
    pendingExemptions: [],
    pendingJoinRequests: [],
  };
}

function normalizeSummary(value: Record<string, number> | null | undefined): CockpitSummary {
  return {
    pending_videos: Number(value?.pending_videos ?? 0),
    pending_submissions: Number(value?.pending_submissions ?? 0),
    pending_exemptions: Number(value?.pending_exemptions ?? 0),
  };
}

function buildScopedSummary(
  value: Record<string, number> | null | undefined,
  rows: {
    pendingVideos: PendingVideoRow[];
    pendingSubmissions: PendingSubmissionRow[];
    pendingExemptions: ExemptionRequestRow[];
  },
): CockpitSummary {
  const summary = normalizeSummary(value);
  return {
    ...summary,
    pending_videos: rows.pendingVideos.length,
    pending_submissions: rows.pendingSubmissions.length,
    pending_exemptions: rows.pendingExemptions.length,
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
    submissionsResult,
    exemptionsResult,
    joinRequestsResult,
  ] = await Promise.all([
    auth.supabase.rpc("admin_cockpit_summary", { target_date: date }),
    auth.supabase.rpc("admin_anomaly_videos_today", {
      p_visible_user_ids: auth.scope.kind === "all" ? null : auth.scope.visibleUserIds,
      target_date: date,
      limit_rows: 10,
    }),
    auth.supabase.rpc("admin_pending_submissions_today", { target_date: date }),
    deps.loadPendingExemptionRows(auth.supabase),
    deps.listPendingRequestsForAdmin(),
  ]);

  const summary = unwrapRpc<Record<string, number>>(summaryResult).data;
  const pendingVideos = filterScopedRows(auth.scope, unwrapRpc<PendingVideoRow[]>(videosResult).data, (row) => row.submitted_by);
  const pendingSubmissions = filterScopedRows(auth.scope, unwrapRpc<PendingSubmissionRow[]>(submissionsResult).data, (row) => row.profile_id);
  const pendingExemptions = filterScopedRows(
    auth.scope,
    exemptionsResult,
    (row) => row.applicant_user_id,
  );
  const pendingJoinRequests = joinRequestsResult.ok
    ? filterScopedRows(auth.scope, joinRequestsResult.data, (row) => row.applicantUserId)
    : [];

  return {
    summary: buildScopedSummary(summary, {
      pendingVideos,
      pendingSubmissions,
      pendingExemptions,
    }),
    pendingVideos,
    pendingSubmissions,
    pendingExemptions,
    pendingJoinRequests,
  };
}

type AdminSupabase = Awaited<ReturnType<typeof requireAdminServiceClient>> extends infer R
  ? R extends { supabase: infer S }
    ? S
    : never
  : never;

export async function loadPendingExemptionRows(
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
