import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizePermissionsForBusinessRole,
  resolveBusinessRole,
  type BusinessGroup,
  type BusinessRole,
} from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";

export type AccessLevel = 1 | 2 | 3 | 4;
export type DataAccessScopeKind = "self" | "group" | "team" | "all";

export interface DataAccessScope {
  userId: string;
  role: UserRole;
  businessRole: BusinessRole;
  permissions: Permissions;
  accessLevel: AccessLevel;
  teamId: string | null;
  groupId: string | null;
  kind: DataAccessScopeKind;
  visibleUserIds: string[];
}

type ScopeSupabase = SupabaseClient;

type ProfileRow = {
  id: string;
  role: UserRole | string | null;
  permissions: Permissions | null;
  access_level?: number | string | null;
  team_id: string | null;
  group_id: string | null;
};

function clampAccessLevel(value: unknown): AccessLevel | null {
  const level = typeof value === "string" ? Number(value) : value;
  if (level === 1 || level === 2 || level === 3 || level === 4) return level;
  return null;
}

export function inferAccessLevel(role: UserRole, permissions: Permissions, explicitLevel?: unknown): AccessLevel {
  const normalized = clampAccessLevel(explicitLevel);
  if (normalized) return normalized;
  if (role === "owner") return 4;
  if (role === "admin" && permissions.view_all_data === true) return 4;
  if (role === "admin") return 3;
  return 1;
}

export function inferBusinessAccessLevel(businessRole: BusinessRole, explicitLevel?: unknown): AccessLevel {
  const normalized = clampAccessLevel(explicitLevel);
  if (normalized) return normalized;
  if (businessRole === "owner") return 4;
  if (businessRole === "team_admin") return 3;
  if (businessRole === "group_leader") return 2;
  return 1;
}

export function getScopeKind(accessLevel: AccessLevel): DataAccessScopeKind {
  if (accessLevel >= 4) return "all";
  if (accessLevel === 3) return "team";
  if (accessLevel === 2) return "group";
  return "self";
}

function isMissingAccessLevelColumn(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("profiles.access_level") || message.includes("access_level") || message.includes("Could not find");
}

async function loadProfile(adminSupabase: ScopeSupabase, userId: string): Promise<ProfileRow | null> {
  const primary = await adminSupabase
    .from("profiles")
    .select("id, role, permissions, access_level, team_id, group_id")
    .eq("id", userId)
    .single();

  if (!isMissingAccessLevelColumn(primary.error)) {
    return (primary.data as ProfileRow | null) ?? null;
  }

  const fallback = await adminSupabase
    .from("profiles")
    .select("id, role, permissions, team_id, group_id")
    .eq("id", userId)
    .single();

  return (fallback.data as ProfileRow | null) ?? null;
}

export async function buildDataAccessScope(adminSupabase: ScopeSupabase, userId: string): Promise<DataAccessScope | null> {
  const profile = await loadProfile(adminSupabase, userId);
  if (!profile) return null;

  const role = (profile.role ?? "member") as UserRole;
  const { data: ledGroupsData } = await adminSupabase
    .from("groups")
    .select("id, team_id, leader_user_id")
    .eq("leader_user_id", userId);
  const ledGroups = (ledGroupsData ?? []) as BusinessGroup[];
  const businessRole = resolveBusinessRole(
    {
      id: profile.id,
      role,
      permissions: (profile.permissions ?? {}) as Permissions,
      team_id: profile.team_id,
      group_id: profile.group_id,
    },
    ledGroups,
  );
  const permissions = normalizePermissionsForBusinessRole(businessRole, (profile.permissions ?? {}) as Permissions);
  const accessLevel = inferBusinessAccessLevel(businessRole, profile.access_level);
  const kind = getScopeKind(accessLevel);

  let visibleUserIds: string[] = [userId];

  if (kind === "all") {
    const { data } = await adminSupabase.from("profiles").select("id");
    visibleUserIds = (data ?? []).map((item) => item.id).filter(Boolean);
  } else if (kind === "team" && profile.team_id) {
    const { data } = await adminSupabase.from("profiles").select("id").eq("team_id", profile.team_id);
    visibleUserIds = (data ?? []).map((item) => item.id).filter(Boolean);
  } else if (kind === "group") {
    const ledGroupIds = ledGroups.map((group) => group.id);
    const visibleGroupIds = ledGroupIds.length > 0 ? ledGroupIds : profile.group_id ? [profile.group_id] : [];
    const { data } = visibleGroupIds.length > 0
      ? await adminSupabase.from("profiles").select("id").in("group_id", visibleGroupIds)
      : { data: [] };
    visibleUserIds = (data ?? []).map((item) => item.id).filter(Boolean);
  }

  if (!visibleUserIds.includes(userId)) {
    visibleUserIds = [userId, ...visibleUserIds];
  }

  return {
    userId,
    role,
    businessRole,
    permissions,
    accessLevel,
    teamId: profile.team_id,
    groupId: profile.group_id,
    kind,
    visibleUserIds: Array.from(new Set(visibleUserIds)),
  };
}

export function canAccessOwner(scope: DataAccessScope, ownerUserId: string | null | undefined) {
  if (scope.kind === "all") return true;
  return typeof ownerUserId === "string" && scope.visibleUserIds.includes(ownerUserId);
}
