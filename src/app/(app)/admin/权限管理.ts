import { PERMISSION_KEYS } from "@/types";
import type { PermissionKey, Permissions, UserRole } from "@/types";

function hasPermission(role: UserRole, permissions: Permissions, key: PermissionKey): boolean {
  if (role === "owner") return true;
  if (role !== "admin") return false;
  return permissions[key] === true;
}

export interface PermissionManagerMember {
  id: string;
  name: string;
  email?: string | null;
  role: UserRole;
  teamId?: string | null;
  teamName?: string | null;
  permissions: Permissions;
}

export interface PermissionManagerCapabilities {
  canEditPermissions: boolean;
  canChangeRole: boolean;
  canRemoveMember: boolean;
}

export interface RemoveMemberTargetInput {
  actorRole: UserRole;
  actorId: string;
  targetId: string;
  targetRole: UserRole;
}

export interface ChangeMemberRoleInput {
  actorRole: UserRole;
  actorId: string;
  actorPermissions: Permissions;
  actorTeamId?: string | null;
  targetId: string;
  targetRole: UserRole;
  targetPermissions: Permissions;
  targetTeamId?: string | null;
  newRole: "member" | "admin";
}

export interface AdminProfileWriteResult {
  id?: string | null;
}

export function getPermissionManagerCapabilities(
  role: UserRole,
  permissions: Permissions,
): PermissionManagerCapabilities {
  if (role === "owner") {
    return {
      canEditPermissions: true,
      canChangeRole: true,
      canRemoveMember: true,
    };
  }

  const canRemoveMember = hasPermission(role, permissions, "manage_members");

  return {
    canEditPermissions: false,
    canChangeRole: canRemoveMember,
    canRemoveMember,
  };
}

export function canChangeMemberRole({
  actorRole,
  actorId,
  actorPermissions,
  actorTeamId,
  targetId,
  targetRole,
  targetPermissions,
  targetTeamId,
  newRole,
}: ChangeMemberRoleInput) {
  if (actorId === targetId) return false;
  if (targetRole === "owner") return false;

  if (actorRole === "owner") return true;

  const actorIsTeamAdmin = actorRole === "admin" && actorPermissions.manage_members === true;
  if (!actorIsTeamAdmin) return false;
  if (!actorTeamId || actorTeamId !== targetTeamId) return false;
  if (targetRole !== "member" && targetRole !== "admin") return false;
  if (targetRole === "admin" && targetPermissions.manage_members === true) return false;
  if (newRole === "admin") return targetRole === "member";
  return targetRole === "admin";
}

export function canRemoveMemberTarget({
  actorRole,
  actorId,
  targetId,
  targetRole,
}: RemoveMemberTargetInput) {
  if (actorId === targetId) return false;
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  return actorRole === "admin" && targetRole === "member";
}

export function isProfileWriteApplied(result: AdminProfileWriteResult | null | undefined) {
  return Boolean(result?.id);
}

function cloneMember(member: PermissionManagerMember): PermissionManagerMember {
  return {
    ...member,
    permissions: { ...member.permissions },
  };
}

export function resetMembersToBaseline(
  _editableMembers: PermissionManagerMember[],
  baselineMembers: PermissionManagerMember[]
): PermissionManagerMember[] {
  return baselineMembers.map(cloneMember);
}

export function applyRoleChangeToMember(
  members: PermissionManagerMember[],
  memberId: string,
  newRole: "member" | "admin"
): PermissionManagerMember[] {
  return members.map((member) => {
    if (member.id !== memberId) return cloneMember(member);

    return {
      ...member,
      role: newRole,
      permissions: newRole === "member" ? {} : { ...member.permissions },
    };
  });
}

function isPermissionEnabled(permissions: Permissions, key: (typeof PERMISSION_KEYS)[number]) {
  return permissions[key] === true;
}

function hasSameAdminPermissions(
  editableMember: PermissionManagerMember,
  baselineMember?: PermissionManagerMember
) {
  return PERMISSION_KEYS.every(
    (key) =>
      isPermissionEnabled(editableMember.permissions, key) ===
      isPermissionEnabled(baselineMember?.permissions ?? {}, key)
  );
}

export function getChangedAdminPermissions(
  editableMembers: PermissionManagerMember[],
  baselineMembers: PermissionManagerMember[]
): PermissionManagerMember[] {
  const baselineMap = new Map(baselineMembers.map((member) => [member.id, member]));

  return editableMembers
    .filter((member) => member.role === "admin")
    .filter((member) => !hasSameAdminPermissions(member, baselineMap.get(member.id)))
    .map(cloneMember);
}

export function hasAdminPermissionChanges(
  editableMembers: PermissionManagerMember[],
  baselineMembers: PermissionManagerMember[]
) {
  return getChangedAdminPermissions(editableMembers, baselineMembers).length > 0;
}
