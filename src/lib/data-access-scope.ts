import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import {
  filterActiveMemberships,
  loadWithMembershipFallback,
} from "@/lib/member-lifecycle";
import { fixedPermissions } from "@/lib/permission-utils";
import { resolveCompanyRole, runtimeRoleForCompanyRole } from "@/lib/company-permissions";
import { resolveGroupModeForUser } from "@/lib/group-mode-server";
import type { CompanyRole, DataScope, Permissions, UserRole } from "@/types";

export type DataAccessScopeKind = DataScope;

export interface DataAccessScope {
  userId: string;
  role: UserRole;
  companyRole?: CompanyRole;
  permissions: Permissions;
  teamId: string | null;
  kind: DataAccessScopeKind;
  visibleUserIds: string[];
  activeVisibleUserIds?: string[];
  groupMode?: boolean;
}

export interface BuildDataAccessScopeOptions {
  perspective?: "company" | "team";
  teamId?: string | null;
  profile?: ScopeProfileInput | null;
}

type ScopeSupabase = SupabaseClient;

export type ScopeProfileInput = {
  id: string;
  role: UserRole | string | null;
  permissions: Permissions | null;
  data_scope?: DataScope | null;
  team_id: string | null;
  membership_status?: string | null;
  company_role?: CompanyRole | string | null;
  group_mode?: boolean;
  group_mode_token_hash?: string;
};

function isMissingColumn(error: { message?: string } | null | undefined, column: string) {
  const message = error?.message ?? "";
  return message.includes(column) || message.includes("Could not find");
}

export function inferDataScope(
  role: UserRole | string | null | undefined,
  _permissions: Permissions | null | undefined,
  companyRole?: CompanyRole | string | null,
  groupMode = false,
): DataScope {
  if (groupMode) return "all";
  const resolvedRole = resolveCompanyRole(companyRole ?? role);
  return resolvedRole === "admin" || resolvedRole === "company_owner" ? "team" : "self";
}

export function resolveDataScope(
  role: UserRole | string | null | undefined,
  configuredScope: DataScope | null | undefined,
  permissions: Permissions | null | undefined,
  companyRole?: CompanyRole | string | null,
  groupMode = false,
): DataScope {
  void configuredScope;
  return inferDataScope(role, permissions, companyRole, groupMode);
}

async function loadProfile(adminSupabase: ScopeSupabase, userId: string): Promise<ScopeProfileInput | null> {
  const primary = await adminSupabase
    .from("profiles")
    .select("id, role, company_role, permissions, data_scope, membership_status, team_id")
    .eq("id", userId)
    .single();

  if (!isMissingColumn(primary.error, "data_scope") && !isMissingColumn(primary.error, "company_role")) {
    assertSupabaseQuerySucceeded(primary.error, "加载权限资料失败");
    return (primary.data as unknown as ScopeProfileInput | null) ?? null;
  }

  const fallback = await adminSupabase
    .from("profiles")
    .select("id, role, permissions, membership_status, team_id")
    .eq("id", userId)
    .single();

  assertSupabaseQuerySucceeded(fallback.error, "加载权限资料失败");
  const profile = fallback.data as unknown as Omit<ScopeProfileInput, "data_scope"> | null;
  if (!profile) return null;

  return {
    ...profile,
    data_scope: inferDataScope(profile.role, profile.permissions, null, false),
  };
}

export async function buildDataAccessScope(
  adminSupabase: ScopeSupabase,
  userId: string,
  options: BuildDataAccessScopeOptions = {},
): Promise<DataAccessScope | null> {
  const profile = options.profile ?? await loadProfile(adminSupabase, userId);
  if (!profile) return null;

  const companyRole = resolveCompanyRole(profile.company_role ?? profile.role) ?? "member";
  const role = runtimeRoleForCompanyRole(companyRole);
  let groupMode = profile.group_mode === true;
  if (!options.profile) {
    try {
      groupMode = (await resolveGroupModeForUser(userId, adminSupabase)).active;
    } catch {
      groupMode = false;
    }
  }
  const kind = resolveDataScope(
    role,
    profile.data_scope,
    profile.permissions,
    companyRole,
    groupMode,
  ) as DataAccessScopeKind;
  const effectiveTeamId = profile.team_id ?? options.teamId ?? null;

  let visibleRows: Array<{
    id: string;
    membership_status?: string | null;
    archive_snapshot?: { team_id?: string | null } | null;
  }> = [
    { id: userId, membership_status: profile.membership_status },
  ];

  if (kind === "all") {
    const result = await loadWithMembershipFallback({
      loadWithMembership: async () => adminSupabase.from("profiles").select("id, membership_status"),
      loadWithoutMembership: async () => adminSupabase.from("profiles").select("id"),
    });
    assertSupabaseQuerySucceeded(result.error, "加载全公司可见成员失败");
    visibleRows = (result.data ?? []) as typeof visibleRows;
  } else if (kind === "team" && effectiveTeamId) {
    // 团队成员与历史归档成员两查互不依赖，并行取（省一次串行往返）
    const [teamResult, historicalResult] = await Promise.all([
      loadWithMembershipFallback({
        loadWithMembership: async () => adminSupabase.from("profiles").select("id, membership_status").eq("team_id", effectiveTeamId),
        loadWithoutMembership: async () => adminSupabase.from("profiles").select("id").eq("team_id", effectiveTeamId),
      }),
      loadWithMembershipFallback({
        loadWithMembership: async () => adminSupabase.from("profiles").select("id, membership_status, archive_snapshot"),
        loadWithoutMembership: async () => adminSupabase.from("profiles").select("id, archive_snapshot"),
      }),
    ]);
    assertSupabaseQuerySucceeded(teamResult.error, "加载团队可见成员失败");
    visibleRows = (teamResult.data ?? []) as typeof visibleRows;

    // Archived profiles lose their active team assignment, but their snapshot
    // still identifies the company that owns their historical records.
    assertSupabaseQuerySucceeded(historicalResult.error, "加载历史成员范围失败");
    const archivedHistoricalRows = ((historicalResult.data ?? []) as typeof visibleRows)
      .filter((row) => row.membership_status === "archived")
      .filter((row) => row.archive_snapshot?.team_id === effectiveTeamId);
    visibleRows = [...visibleRows, ...archivedHistoricalRows];
  }

  let visibleUserIds = visibleRows.map((item) => item.id).filter(Boolean);
  if (!visibleUserIds.includes(userId)) {
    visibleUserIds = [userId, ...visibleUserIds];
    visibleRows = [{ id: userId, membership_status: profile.membership_status }, ...visibleRows];
  }

  const activeVisibleUserIds = filterActiveMemberships(visibleRows)
    .map((item) => item.id)
    .filter(Boolean);

  return {
    userId,
    role,
    companyRole,
    permissions: fixedPermissions(companyRole, profile.permissions, groupMode),
    teamId: effectiveTeamId,
    kind,
    visibleUserIds: Array.from(new Set(visibleUserIds)),
    activeVisibleUserIds: Array.from(new Set(activeVisibleUserIds)),
    groupMode,
  };
}

export function canAccessOwner(scope: DataAccessScope, ownerUserId: string | null | undefined) {
  if (scope.kind === "all") return true;
  return typeof ownerUserId === "string" && scope.visibleUserIds.includes(ownerUserId);
}

export function getActiveVisibleUserIds(scope: Pick<DataAccessScope, "activeVisibleUserIds" | "visibleUserIds">) {
  return scope.activeVisibleUserIds ?? scope.visibleUserIds;
}

export function filterRowsByDataScope<T>(
  scope: DataAccessScope,
  rows: T[],
  getOwnerUserId: (row: T) => string | null | undefined,
) {
  if (scope.kind === "all") return rows;
  return rows.filter((row) => canAccessOwner(scope, getOwnerUserId(row)));
}
