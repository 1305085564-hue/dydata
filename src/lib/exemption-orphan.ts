import type { SupabaseClient } from "@supabase/supabase-js";

import type { DataAccessScope } from "@/lib/data-access-scope";

export const ORPHAN_EXEMPTION_REVIEW_NOTE = "归属已修正，请重新提交";

const ORPHAN_REQUEST_SELECT =
  "id, applicant_user_id, team_id, exemption_type, exemption_category, start_date, end_date, reason, request_status, created_at";
const ORPHAN_QUERY_PAGE_SIZE = 1000;

export type OrphanExemptionRequestRecord = {
  id: string;
  applicant_user_id: string | null;
  team_id: string | null;
  exemption_type: string;
  exemption_category: string | null;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  request_status: string | null;
  created_at: string;
};

export type OrphanApplicantProfile = {
  id: string;
  name: string | null;
  team_id: string | null;
  membership_status: string | null;
};

export type OrphanTeam = {
  id: string;
  name: string | null;
};

export type OrphanExemptionRequest = {
  id: string;
  applicant_user_id: string;
  applicant_name: string;
  applicant_membership_status: string | null;
  exemption_type: string;
  exemption_category: string | null;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  snapshot_team_id: string | null;
  snapshot_team_name: string | null;
  created_at: string;
};

export type OrphanScope = Pick<DataAccessScope, "kind" | "teamId"> & {
  activeVisibleUserIds?: string[];
  visibleUserIds?: string[];
};

export type OrphanMutationAction = "assign" | "reject";

export type OrphanMutationPreflightInput = {
  action: OrphanMutationAction;
  request: Pick<OrphanExemptionRequestRecord, "applicant_user_id" | "request_status" | "team_id">;
  applicant: Pick<OrphanApplicantProfile, "team_id" | "membership_status"> | null;
  actorScope: Pick<DataAccessScope, "kind" | "teamId">;
  requestedApplicantId?: string | null;
};

export function isCompanyOwnerActor(actor: { companyRole?: string | null; role?: string | null }) {
  return actor.companyRole === "company_owner" || actor.role === "owner";
}

export function isOrphanSnapshotVisible({
  snapshotTeamId,
  scope,
}: {
  snapshotTeamId: string | null;
  scope: Pick<DataAccessScope, "kind" | "teamId">;
}) {
  if (scope.kind === "all") return true;
  return Boolean(scope.teamId && snapshotTeamId && scope.teamId === snapshotTeamId);
}

/**
 * This mirrors /api/exemptions/pending: group scope passes null and therefore
 * exposes every pending applicant; team scope uses activeVisibleUserIds.
 * The orphan list subtracts this set so one request cannot count twice.
 */
export function getOrdinaryQueueVisibleApplicantIds(
  rows: Pick<OrphanExemptionRequestRecord, "applicant_user_id">[],
  scope: OrphanScope,
) {
  if (scope.kind === "all") {
    return new Set(rows.map((row) => row.applicant_user_id).filter((id): id is string => Boolean(id)));
  }

  return new Set(scope.activeVisibleUserIds ?? scope.visibleUserIds ?? []);
}

export function filterOrphanExemptionRequests({
  rows,
  profiles,
  teams,
  scope,
  ordinaryVisibleApplicantIds,
  limit = 200,
}: {
  rows: OrphanExemptionRequestRecord[];
  profiles: OrphanApplicantProfile[];
  teams: OrphanTeam[];
  scope: Pick<DataAccessScope, "kind" | "teamId">;
  ordinaryVisibleApplicantIds: ReadonlySet<string>;
  limit?: number;
}) {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const filtered = rows
    .filter((row) => row.request_status === "pending")
    .filter((row) => Boolean(row.applicant_user_id))
    .filter((row) => !ordinaryVisibleApplicantIds.has(row.applicant_user_id as string))
    .filter((row) => isOrphanSnapshotVisible({ snapshotTeamId: row.team_id, scope }))
    .filter((row) => {
      const applicant = profileById.get(row.applicant_user_id as string);
      return !applicant || applicant.team_id === null;
    })
    .map((row) => {
      const applicant = profileById.get(row.applicant_user_id as string);
      const team = row.team_id ? teamById.get(row.team_id) : null;

      return {
        id: row.id,
        applicant_user_id: row.applicant_user_id as string,
        applicant_name: applicant?.name ?? "已注销账号",
        applicant_membership_status: applicant?.membership_status ?? null,
        exemption_type: row.exemption_type,
        exemption_category: row.exemption_category ?? null,
        start_date: row.start_date,
        end_date: row.end_date ?? null,
        reason: row.reason ?? null,
        snapshot_team_id: row.team_id ?? null,
        snapshot_team_name: team?.name ?? null,
        created_at: row.created_at,
      } satisfies OrphanExemptionRequest;
    });

  return {
    data: filtered.slice(0, Math.max(1, limit)),
    count: filtered.length,
  };
}

export function resolveOrphanMutationPreflight(input: OrphanMutationPreflightInput) {
  if (input.requestedApplicantId && input.requestedApplicantId !== input.request.applicant_user_id) {
    return { ok: false as const, error: "申请人与成员不匹配，请刷新后重试" };
  }
  if (input.request.request_status !== "pending") {
    return { ok: false as const, error: "该申请已处理" };
  }
  if (!isOrphanSnapshotVisible({ snapshotTeamId: input.request.team_id, scope: input.actorScope })) {
    return { ok: false as const, error: "不能操作当前管理范围外的归属异常申请" };
  }

  if (input.action === "reject") {
    if (
      !input.applicant
      || input.applicant.membership_status === "archived"
      || input.applicant.team_id === null
    ) {
      return { ok: true as const };
    }
    return { ok: false as const, error: "申请人已分配团队，请刷新后从普通队列处理" };
  }

  if (!input.applicant || input.applicant.membership_status === "archived") {
    return { ok: false as const, error: "已归档或已注销的申请人只能拒绝并留痕" };
  }
  if (input.applicant.team_id !== null) {
    return { ok: false as const, error: "申请人已分配团队，请刷新后重试" };
  }

  return { ok: true as const };
}

export function buildOrphanRejectionAuditDetail(input: {
  applicantUserId: string | null;
  applicantMembershipStatus: string | null;
  snapshotTeamId: string | null;
}) {
  return JSON.stringify({
    review_note: ORPHAN_EXEMPTION_REVIEW_NOTE,
    applicant_user_id: input.applicantUserId,
    applicant_membership_status: input.applicantMembershipStatus,
    snapshot_team_id: input.snapshotTeamId,
  });
}

export function buildOrphanRejectionAuditEntry(input: {
  requestId: string;
  applicantUserId: string | null;
  applicantMembershipStatus: string | null;
  snapshotTeamId: string | null;
}) {
  return {
    action: "reject_orphan_exemption_request",
    target: input.requestId,
    detail: buildOrphanRejectionAuditDetail(input),
  };
}

export function isMissingReviewNoteColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42703" || message.includes("review_note") || message.includes("Could not find");
}

async function loadPendingRows(supabase: SupabaseClient, scope: OrphanScope) {
  if (scope.kind !== "all" && !scope.teamId) return [];

  const rows: OrphanExemptionRequestRecord[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("exemption_request")
      .select(ORPHAN_REQUEST_SELECT)
      .eq("request_status", "pending");
    if (scope.kind !== "all") {
      query = query.eq("team_id", scope.teamId as string);
    }

    const result = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + ORPHAN_QUERY_PAGE_SIZE - 1);
    if (result.error) throw new Error("读取待归属申请失败");

    const page = (result.data ?? []) as unknown as OrphanExemptionRequestRecord[];
    rows.push(...page);
    if (page.length < ORPHAN_QUERY_PAGE_SIZE) break;
    offset += ORPHAN_QUERY_PAGE_SIZE;
  }

  return rows;
}

export async function loadOrphanExemptionRequests({
  supabase,
  scope,
  limit = 200,
}: {
  supabase: SupabaseClient;
  scope: OrphanScope;
  limit?: number;
}) {
  const rows = await loadPendingRows(supabase, scope);
  const applicantIds = Array.from(new Set(rows.map((row) => row.applicant_user_id).filter((id): id is string => Boolean(id))));
  const profilesResult = applicantIds.length > 0
    ? await supabase.from("profiles").select("id, name, team_id, membership_status").in("id", applicantIds)
    : { data: [] as OrphanApplicantProfile[], error: null };
  if (profilesResult.error) throw new Error("读取待归属申请人信息失败");

  const snapshotTeamIds = Array.from(new Set(rows.map((row) => row.team_id).filter((id): id is string => Boolean(id))));
  const teamsResult = snapshotTeamIds.length > 0
    ? await supabase.from("teams").select("id, name").in("id", snapshotTeamIds)
    : { data: [] as OrphanTeam[], error: null };
  if (teamsResult.error) throw new Error("读取待归属申请团队失败");

  const ordinaryVisibleApplicantIds = getOrdinaryQueueVisibleApplicantIds(rows, scope);
  return filterOrphanExemptionRequests({
    rows,
    profiles: (profilesResult.data ?? []) as OrphanApplicantProfile[],
    teams: (teamsResult.data ?? []) as OrphanTeam[],
    scope,
    ordinaryVisibleApplicantIds,
    limit,
  });
}

export async function loadOrphanExemptionCount({
  supabase,
  scope,
}: {
  supabase: SupabaseClient;
  scope: OrphanScope;
}) {
  const result = await loadOrphanExemptionRequests({ supabase, scope, limit: 1 });
  return result.count;
}

export const __internal = {
  ORPHAN_REQUEST_SELECT,
  ORPHAN_QUERY_PAGE_SIZE,
};
