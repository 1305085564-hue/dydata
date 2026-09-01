import { PERMISSION_KEYS } from "@/types";
import type { CompanyRole, DataScope, ExemptType, ExemptionCategory, Permissions, UserRole, UserStatus } from "@/types";

export interface PermissionManagerMember {
  id: string;
  name: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  role: UserRole;
  teamId?: string | null;
  teamName?: string | null;
  permissions: Permissions;
  data_scope?: DataScope | null;
  status?: UserStatus | null;
  exempt_type?: ExemptType | null;
  exempt_start_date?: string | null;
  exempt_end_date?: string | null;
  exempt_reason?: string | null;
  exemption_category?: ExemptionCategory | null;
}

export interface PermissionManagerCapabilities {
  canEditPermissions: boolean;
  canChangeRole: boolean;
  canRemoveMember: boolean;
}

export interface RemoveMemberTargetInput {
  actorRole: UserRole;
  actorId: string;
  actorPermissions: Permissions;
  actorTeamId?: string | null;
  groupMode?: boolean;
  targetId: string;
  targetRole: UserRole;
  targetPermissions: Permissions;
  targetTeamId?: string | null;
}

export interface ChangeMemberRoleInput {
  actorRole: UserRole;
  actorCompanyRole?: CompanyRole | null;
  actorId: string;
  actorPermissions: Permissions;
  actorTeamId?: string | null;
  groupMode?: boolean;
  targetId: string;
  targetRole: UserRole;
  targetPermissions: Permissions;
  targetTeamId?: string | null;
  newRole: "member" | "admin";
}

export interface TransferMemberTeamInput {
  actorRole: UserRole;
  actorCompanyRole?: CompanyRole | null;
  actorId: string;
  actorPermissions: Permissions;
  actorTeamId?: string | null;
  groupMode?: boolean;
  targetId: string;
  targetRole: UserRole;
  targetTeamId?: string | null;
  newTeamId: string | null;
}

export interface MemberTeamTransferDecision {
  shouldApply: boolean;
  error?: string;
}

export interface AdminProfileWriteResult {
  id?: string | null;
}

export interface PermissionUpdateInput {
  actorRole: UserRole;
  actorCompanyRole?: CompanyRole | null;
  actorId: string;
  actorPermissions: Permissions;
  actorTeamId?: string | null;
  groupMode?: boolean;
  targetId: string;
  targetRole: UserRole;
  targetPermissions: Permissions;
  targetTeamId?: string | null;
  newPermissions: Permissions;
  newDataScope?: DataScope;
}

export type PermissionUpdateDecision =
  | { permissions: Permissions; dataScope?: DataScope; error?: never }
  | { permissions?: never; dataScope?: never; error: string };

function isCompanyOwnerActor(actorRole: UserRole, actorCompanyRole?: CompanyRole | null) {
  return actorCompanyRole === "company_owner" || actorRole === "owner";
}

function canManagePermissionTarget({
  actorRole,
  actorId,
  actorPermissions,
  actorTeamId,
  groupMode,
  targetId,
  targetRole,
  targetTeamId,
}: {
  actorRole: UserRole;
  actorId: string;
  actorPermissions: Permissions;
  actorTeamId?: string | null;
  groupMode?: boolean;
  targetId: string;
  targetRole: UserRole;
  targetTeamId?: string | null;
}) {
  if (actorId === targetId) return false;
  if (targetRole === "owner") return false;
  if (groupMode === true) return true;
  if (actorRole !== "admin") return false;
  if (actorPermissions.manage_members !== true) return false;
  if (!actorTeamId || !targetTeamId) return false;
  return actorTeamId === targetTeamId;
}

export function sanitizePermissions(newPermissions: Permissions): Permissions {
  const sanitized: Permissions = {};

  for (const key of PERMISSION_KEYS) {
    if (typeof newPermissions[key] === "boolean") {
      sanitized[key] = newPermissions[key];
    }
  }

  return sanitized;
}

export function resolvePermissionUpdate({
  actorRole,
  actorCompanyRole,
  actorId,
  actorPermissions,
  actorTeamId,
  groupMode,
  targetId,
  targetRole,
  targetTeamId,
  newPermissions,
  newDataScope,
}: PermissionUpdateInput): PermissionUpdateDecision {
  if (!canManagePermissionTarget({
    actorRole,
    actorId,
    actorPermissions,
    actorTeamId: actorTeamId ?? null,
    groupMode,
    targetId,
    targetRole,
    targetTeamId: targetTeamId ?? null,
  })) {
    if (actorId === targetId) return { error: "不能修改自己的权限" };
    if (targetRole === "owner") return { error: "不能修改创始人的权限" };
    return { error: actorRole === "admin" && actorPermissions.manage_members === true ? "负责人只能修改本团队权限" : "无权限" };
  }

  if (targetRole === "admin" && groupMode !== true && !isCompanyOwnerActor(actorRole, actorCompanyRole)) {
    return { error: "负责人不能修改组长" };
  }

  if (targetRole === "admin" || targetRole === "member") {
    return {
      permissions: sanitizePermissions(newPermissions),
      dataScope: newDataScope ?? "self",
    };
  }

  return { error: "用户角色无效" };
}

export function getPermissionManagerCapabilities(
  role: UserRole,
  permissions: Permissions,
  companyRole?: CompanyRole | null,
  groupMode = false,
): PermissionManagerCapabilities {
  const canManageMembers =
    groupMode || isCompanyOwnerActor(role, companyRole) || permissions.manage_members === true;

  return {
    canEditPermissions: canManageMembers,
    canChangeRole: groupMode || isCompanyOwnerActor(role, companyRole),
    canRemoveMember: canManageMembers,
  };
}

export function canChangeMemberRole({
  actorRole,
  actorCompanyRole,
  actorId,
  actorPermissions,
  actorTeamId,
  groupMode,
  targetId,
  targetRole,
  targetTeamId,
  newRole,
}: ChangeMemberRoleInput) {
  if (actorId === targetId) return false;
  if (targetRole === "owner") return false;
  if (groupMode === true) return true;

  const actorIsTeamAdmin = actorRole === "admin" && actorPermissions.manage_members === true;
  if (!actorIsTeamAdmin) return false;
  if (!actorTeamId || actorTeamId !== targetTeamId) return false;
  if (targetRole !== "member" && targetRole !== "admin") return false;
  const canChangeLeaderRole = isCompanyOwnerActor(actorRole, actorCompanyRole);
  if (!canChangeLeaderRole && (targetRole === "admin" || newRole === "admin")) return false;
  if (newRole === "admin") return targetRole === "member";
  return targetRole === "admin";
}

export function canRemoveMemberTarget({
  actorRole,
  actorId,
  actorPermissions,
  actorTeamId,
  groupMode,
  targetId,
  targetRole,
  targetTeamId,
}: RemoveMemberTargetInput) {
  if (actorId === targetId) return false;
  if (targetRole === "owner") return false;
  if (groupMode === true) return true;

  const actorIsTeamAdmin = actorRole === "admin" && actorPermissions.manage_members === true;
  if (!actorIsTeamAdmin) return false;
  if (!actorTeamId || actorTeamId !== targetTeamId) return false;
  return targetRole === "member";
}

export function resolveMemberTeamTransfer({
  actorRole,
  actorCompanyRole,
  actorId,
  actorPermissions,
  actorTeamId,
  groupMode,
  targetId,
  targetRole,
  targetTeamId,
  newTeamId,
}: TransferMemberTeamInput): MemberTeamTransferDecision {
  const oldTeamId = targetTeamId ?? null;

  if (actorId === targetId) return { shouldApply: false, error: "不能调配自己的团队" };
  if (targetRole === "owner") return { shouldApply: false, error: "不能调配创始人的团队" };
  if (newTeamId === oldTeamId) return { shouldApply: false };

  if (groupMode === true) return { shouldApply: true };

  const actorIsTeamAdmin = actorRole === "admin" && actorPermissions.manage_members === true;
  if (!actorIsTeamAdmin) return { shouldApply: false, error: "无权限" };
  if (!isCompanyOwnerActor(actorRole, actorCompanyRole) && targetRole === "admin") {
    return { shouldApply: false, error: "负责人不能调配组长" };
  }
  if (!actorTeamId) return { shouldApply: false, error: "负责人只能调配本团队/未分配成员" };

  if (oldTeamId === null && newTeamId === actorTeamId) return { shouldApply: true };
  if (oldTeamId === actorTeamId && newTeamId === null) return { shouldApply: true };

  return { shouldApply: false, error: "负责人只能调配本团队/未分配成员" };
}

export function buildMemberTeamTransferPatch(newTeamId: string | null) {
  return {
    team_id: newTeamId,
  };
}

export function buildRemovedMemberProfilePatch() {
  return {
    role: "member" as const,
    permissions: {},
    team_id: null,
    data_scope: "self" as const,
  };
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
  baselineMembers: PermissionManagerMember[],
): PermissionManagerMember[] {
  return baselineMembers.map(cloneMember);
}

export function applyRoleChangeToMember(
  members: PermissionManagerMember[],
  memberId: string,
  newRole: "member" | "admin",
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

function hasSamePermissions(
  editableMember: PermissionManagerMember,
  baselineMember?: PermissionManagerMember,
) {
  return PERMISSION_KEYS.every(
    (key) =>
      isPermissionEnabled(editableMember.permissions, key) ===
      isPermissionEnabled(baselineMember?.permissions ?? {}, key),
  );
}

export function getChangedAdminPermissions(
  editableMembers: PermissionManagerMember[],
  baselineMembers: PermissionManagerMember[],
): PermissionManagerMember[] {
  const baselineMap = new Map(baselineMembers.map((member) => [member.id, member]));

  return editableMembers
    .filter((member) => member.role === "admin" || member.role === "member")
    .filter((member) => !hasSamePermissions(member, baselineMap.get(member.id)))
    .map(cloneMember);
}

export function hasAdminPermissionChanges(
  editableMembers: PermissionManagerMember[],
  baselineMembers: PermissionManagerMember[],
) {
  return getChangedAdminPermissions(editableMembers, baselineMembers).length > 0;
}
