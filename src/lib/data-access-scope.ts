import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import {
  filterActiveMemberships,
  loadWithMembershipFallback,
} from "@/lib/member-lifecycle";
import { fixedPermissions } from "@/lib/permission-utils";
import { resolveCompanyRole } from "@/lib/company-permissions";
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
  if (companyRole === "company_owner") return "team";
  if (role === "owner") return "all";
  if (role === "admin") return "team";
  return "self";
}

export function resolveDataScope(
  role: UserRole | string | null | undefined,
  configuredScope: DataScope | null | undefined,
  permissions: Permissions | null | undefined,
  companyRole?: CompanyRole | string | null,
  groupMode = false,
): DataScope {
  if (groupMode) return "all";
  if (companyRole === "company_owner") return "team";
  if (role === "owner") return "all";
  return configuredScope ?? inferDataScope(role, permissions, companyRole, groupMode);
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
  const role = companyRole === "company_owner" ? "owner" : companyRole;
  const groupMode = profile.group_mode === true;
  const kind = resolveDataScope(
    role,
    profile.data_scope,
    profile.permissions,
    companyRole,
    groupMode,
  ) as DataAccessScopeKind;
  const effectiveTeamId = profile.team_id ?? options.teamId ?? null;

  let visibleRows: Array<{ id: string; membership_status?: string | null }> = [
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
    const result = await loadWithMembershipFallback({
      loadWithMembership: async () => adminSupabase.from("profiles").select("id, membership_status").eq("team_id", effectiveTeamId),
      loadWithoutMembership: async () => adminSupabase.from("profiles").select("id").eq("team_id", effectiveTeamId),
    });
    assertSupabaseQuerySucceeded(result.error, "加载团队可见成员失败");
    visibleRows = (result.data ?? []) as typeof visibleRows;
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
  return typeof ownerUserId === "string"
    && ownerUserId.length > 0
    && (scope.kind === "all" || scope.visibleUserIds.includes(ownerUserId));
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
