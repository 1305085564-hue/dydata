import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { ProfileSummary } from "@/lib/modules/types";
import { isMemberTargetReadOnly } from "./team-view-logic";
import type { CompanyRole, Permissions, UserRole } from "@/types";

export type AdminModulesAccessInput = {
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserBusinessRole?: UserRole;
  currentUserCompanyRole?: CompanyRole;
  currentUserGroupMode?: boolean;
  currentUserPermissions: Permissions;
  permissionManagerCapabilities: {
    canRemoveMember: boolean;
    canChangeRole: boolean;
    canEditPermissions: boolean;
  };
  teamManagement: {
    access: {
      canEditMembers?: boolean;
    };
  };
};

export type AdminModulesAccess = {
  currentCompanyRole: CompanyRole | null;
  isGroupMode: boolean;
  isOwner: boolean;
  isCompanyOwner: boolean;
  isTeamAdmin: boolean;
  canManageCompany: boolean;
  canManageTeamStructure: boolean;
  canManageMembers: boolean;
  canEditTeamMembers: boolean;
  canManageLifecycle: boolean;
  canArchiveTarget: (target: Pick<ProfileSummary, "id" | "role" | "company_role"> & Partial<Pick<ProfileSummary, "membership_status" | "archive_snapshot">>) => boolean;
};

export function resolveAdminModulesAccess(input: AdminModulesAccessInput): AdminModulesAccess {
  const currentRoleValue = input.currentUserBusinessRole ?? (
    input.currentUserCompanyRole === "company_owner" && input.currentUserRole === "admin"
      ? input.currentUserCompanyRole
      : input.currentUserRole
  );
  const currentRoleResolution = resolveProfileCompanyRole(currentRoleValue, input.currentUserCompanyRole);
  const currentCompanyRole = currentRoleResolution.conflict ? null : currentRoleResolution.companyRole;
  const hasResolvedActorRole = currentCompanyRole !== null;
  const isGroupMode = currentCompanyRole === "company_owner" && input.currentUserGroupMode === true;
  const isOwner = currentCompanyRole === "company_owner";
  const isCompanyOwner = currentCompanyRole === "company_owner";
  const isTeamAdmin = currentCompanyRole === "admin" && input.currentUserPermissions.manage_members === true;
  const canManageCompany = isCompanyOwner || isGroupMode;
  const canManageTeamStructure = isCompanyOwner && isGroupMode;
  const canManageMembers = hasResolvedActorRole && (
    canManageCompany
    || input.permissionManagerCapabilities.canEditPermissions
    || input.currentUserPermissions.manage_members === true
  );
  const canEditTeamMembers = hasResolvedActorRole && (
    input.teamManagement.access.canEditMembers === true || canManageMembers
  );
  const canManageLifecycle = canManageCompany || isTeamAdmin;

  return {
    currentCompanyRole,
    isGroupMode,
    isOwner,
    isCompanyOwner,
    isTeamAdmin,
    canManageCompany,
    canManageTeamStructure,
    canManageMembers,
    canEditTeamMembers,
    canManageLifecycle,
    canArchiveTarget: (target) => {
      if (!canManageLifecycle) return false;
      const isArchived = target.membership_status === "archived";
      const snapshotRole = typeof target.archive_snapshot?.role === "string"
        ? target.archive_snapshot.role
        : null;
      const snapshotCompanyRole = typeof target.archive_snapshot?.company_role === "string"
        ? target.archive_snapshot.company_role
        : null;
      const hasSnapshotRole = snapshotRole !== null || snapshotCompanyRole !== null;
      if (isArchived && !hasSnapshotRole && !isCompanyOwner && !isGroupMode) return false;

      const effectiveTarget = isArchived && hasSnapshotRole
        ? { ...target, role: snapshotRole, company_role: snapshotCompanyRole }
        : target;
      if (isMemberTargetReadOnly(effectiveTarget, input.currentUserId)) return false;
      const targetRoleResolution = resolveProfileCompanyRole(effectiveTarget.role, effectiveTarget.company_role);
      return targetRoleResolution.companyRole !== null &&
        !targetRoleResolution.conflict &&
        (isCompanyOwner || isGroupMode || targetRoleResolution.companyRole !== "admin");
    },
  };
}
