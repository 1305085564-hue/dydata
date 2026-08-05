import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import {
  filterActiveMemberships,
  loadWithMembershipFallback,
} from "@/lib/member-lifecycle";
import type { DataScope, Permissions, UserRole } from "@/types";

export type DataAccessScopeKind = DataScope;

export interface DataAccessScope {
  userId: string;
  role: UserRole;
  permissions: Permissions;
  teamId: string | null;
  kind: DataAccessScopeKind;
  visibleUserIds: string[];
  activeVisibleUserIds?: string[];
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
};

async function loadProfile(adminSupabase: ScopeSupabase, userId: string): Promise<ScopeProfileInput | null> {
  const result = await adminSupabase
    .from("profiles")
    .select("id, role, permissions, data_scope, membership_status, team_id")
    .eq("id", userId)
    .single();

  assertSupabaseQuerySucceeded(result.error, "加载权限资料失败");
  return (result.data as unknown as ScopeProfileInput | null) ?? null;
}

export async function buildDataAccessScope(
  adminSupabase: ScopeSupabase,
  userId: string,
  options: BuildDataAccessScopeOptions = {},
): Promise<DataAccessScope | null> {
  const profile = options.profile ?? await loadProfile(adminSupabase, userId);
  if (!profile) return null;

  const role = (profile.role ?? "member") as UserRole;
  const kind = (profile.data_scope ?? "self") as DataAccessScopeKind;
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
    permissions: (profile.permissions ?? {}) as Permissions,
    teamId: effectiveTeamId,
    kind,
    visibleUserIds: Array.from(new Set(visibleUserIds)),
    activeVisibleUserIds: Array.from(new Set(activeVisibleUserIds)),
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
