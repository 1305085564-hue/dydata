import type { CompanyRole, Permissions, UserRole } from "@/types";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";

export interface TeamManagementProfile {
  id: string;
  name: string;
  role: UserRole;
  company_role?: CompanyRole | string | null;
  status?: string | null;
  permissions?: Permissions | null;
  team_id?: string | null;
  email?: string | null;
}

export type TeamManagementAccess =
  | {
      level: "owner";
      canView: true;
      canEditMembers: true;
      teamIds: null;
    }
  | {
      level: "admin";
      canView: boolean;
      canEditMembers: boolean;
      teamIds: string[] | null;
    }
  | {
      level: "member";
      canView: boolean;
      canEditMembers: false;
      teamIds: string[];
    };

export function isIgnoredTeamManagementUser(profile: Pick<TeamManagementProfile, "name" | "email">) {
  const name = profile.name.trim().toLowerCase();
  const email = profile.email?.trim().toLowerCase() ?? "";

  return name.includes("codex") || email.endsWith("@dydata.local");
}

export function isTeamAdmin(profile: Pick<TeamManagementProfile, "role" | "company_role" | "permissions">) {
  const roleResolution = resolveProfileCompanyRole(profile.role, profile.company_role);
  return roleResolution.companyRole === "admin" && profile.permissions?.manage_members === true;
}

export function canManageTeamStructure(
  companyRole: CompanyRole | undefined,
  permissions: Permissions,
  groupMode = false,
) {
  return companyRole === "company_owner" && permissions.manage_members === true && groupMode === true;
}

export function resolveTeamManagementAccess(
  actor: TeamManagementProfile,
  groupMode = false,
): TeamManagementAccess {
  const roleResolution = resolveProfileCompanyRole(actor.role, actor.company_role);
  if (roleResolution.conflict || !roleResolution.companyRole) {
    return {
      level: "member",
      canView: false,
      canEditMembers: false,
      teamIds: [],
    };
  }

  const companyRole = roleResolution.companyRole;

  if (groupMode && companyRole === "company_owner") {
    return {
      level: "owner",
      canView: true,
      canEditMembers: true,
      teamIds: null,
    };
  }

  if (companyRole === "company_owner") {
    if (actor.team_id) {
      return {
        level: "admin",
        canView: true,
        canEditMembers: true,
        teamIds: [actor.team_id],
      };
    }
    return {
      level: "admin",
      canView: false,
      canEditMembers: false,
      teamIds: [],
    };
  }

  if (isTeamAdmin(actor)) {
    if (!actor.team_id) {
      return {
        level: "admin",
        canView: false,
        canEditMembers: false,
        teamIds: [],
      };
    }
    return {
      level: "admin",
      canView: true,
      canEditMembers: true,
      teamIds: [actor.team_id],
    };
  }

  if (actor.team_id) {
    return {
      level: "member",
      canView: true,
      canEditMembers: false,
      teamIds: [actor.team_id],
    };
  }

  return {
    level: "member",
    canView: false,
    canEditMembers: false,
    teamIds: [],
  };
}

export function canAccessTeam(access: TeamManagementAccess, teamId: string | null | undefined) {
  if (!access.canView) return false;
  if (access.teamIds === null) return true;
  return Boolean(teamId && access.teamIds.includes(teamId));
}

export function filterUsableLeaderCandidates(
  access: TeamManagementAccess,
  profiles: TeamManagementProfile[],
) {
  if (!access.canEditMembers) return [];

  return profiles.filter((profile) => {
    if (!profile.team_id) return false;
    const roleResolution = resolveProfileCompanyRole(profile.role, profile.company_role);
    if (roleResolution.conflict || roleResolution.companyRole !== "admin") return false;
    if (profile.permissions?.manage_members === true) return false;
    if (isIgnoredTeamManagementUser(profile)) return false;
    return canAccessTeam(access, profile.team_id);
  });
}

export function filterVisibleTeamManagementProfiles(
  access: TeamManagementAccess,
  profiles: TeamManagementProfile[],
) {
  if (!access.canView) return [];
  return profiles.filter((profile) => {
    const roleResolution = resolveProfileCompanyRole(profile.role, profile.company_role);
    if (roleResolution.conflict || !roleResolution.companyRole) return false;
    return canAccessTeam(access, profile.team_id);
  });
}
