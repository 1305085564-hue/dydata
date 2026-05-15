import {
  PERMISSION_KEYS,
  type PermissionKey,
  type Permissions,
  type UserRole,
} from "@/types";

export type BusinessRole = "owner" | "team_admin" | "group_leader" | "member";
export type BusinessScopeKind = "global" | "team" | "group" | "self";

export interface BusinessProfile {
  id: string;
  role: UserRole;
  permissions?: Permissions | null;
  team_id?: string | null;
  group_id?: string | null;
}

export interface BusinessGroup {
  id: string;
  team_id: string | null;
  leader_user_id: string | null;
}

const TEAM_ADMIN_DEFAULT_PERMISSIONS = Object.fromEntries(
  PERMISSION_KEYS.map((key) => [key, true]),
) as Record<PermissionKey, boolean>;

const GROUP_LEADER_DEFAULT_PERMISSIONS: Record<PermissionKey, boolean> = {
  view_all_data: false,
  edit_data: false,
  export_data: true,
  view_analytics: true,
  manage_members: false,
  manage_violations: false,
  view_conversion_hub: false,
  view_content_review: false,
  manage_video_assets: false,
  use_ai_copywriting: true,
  use_ai_management: false,
};

const MEMBER_DEFAULT_PERMISSIONS: Record<PermissionKey, boolean> = Object.fromEntries(
  PERMISSION_KEYS.map((key) => [key, false]),
) as Record<PermissionKey, boolean>;

export function resolveBusinessRole(
  profile: BusinessProfile,
  groups: BusinessGroup[] = [],
): BusinessRole {
  if (profile.role === "owner") return "owner";
  if (profile.role === "admin" && profile.permissions?.manage_members === true) return "team_admin";
  if (profile.role === "admin" && groups.some((group) => group.leader_user_id === profile.id)) return "group_leader";
  return "member";
}

export function getBusinessScopeKind(businessRole: BusinessRole): BusinessScopeKind {
  if (businessRole === "owner") return "global";
  if (businessRole === "team_admin") return "team";
  if (businessRole === "group_leader") return "group";
  return "self";
}

function getDefaultPermissionsForBusinessRole(businessRole: BusinessRole): Record<PermissionKey, boolean> {
  if (businessRole === "owner" || businessRole === "team_admin") return TEAM_ADMIN_DEFAULT_PERMISSIONS;
  if (businessRole === "group_leader") return GROUP_LEADER_DEFAULT_PERMISSIONS;
  return MEMBER_DEFAULT_PERMISSIONS;
}

export function normalizePermissionsForBusinessRole(
  businessRole: BusinessRole,
  permissions: Permissions | null | undefined,
): Permissions {
  const defaults = getDefaultPermissionsForBusinessRole(businessRole);
  const normalized: Permissions = {};

  for (const key of PERMISSION_KEYS) {
    normalized[key] = typeof permissions?.[key] === "boolean" ? permissions[key] : defaults[key];
  }

  return normalized;
}

export function hasBusinessPermission(
  businessRole: BusinessRole,
  permissions: Permissions | null | undefined,
  key: PermissionKey,
) {
  if (businessRole === "owner") return true;
  return normalizePermissionsForBusinessRole(businessRole, permissions)[key] === true;
}

export function canManagePermissionsForTarget(
  actor: BusinessProfile,
  target: BusinessProfile,
  groups: BusinessGroup[] = [],
) {
  if (actor.id === target.id) return false;
  if (target.role === "owner") return false;

  const actorBusinessRole = resolveBusinessRole(actor, groups);
  if (actorBusinessRole === "owner") return true;

  if (actorBusinessRole !== "team_admin") return false;
  if (!actor.team_id || !target.team_id) return false;
  return actor.team_id === target.team_id;
}
