import type { Permissions, UserRole } from "@/types";

export interface TeamManagementProfile {
  id: string;
  name: string;
  role: UserRole;
  status?: string | null;
  permissions?: Permissions | null;
  team_id?: string | null;
  group_id?: string | null;
  email?: string | null;
}

export interface TeamManagementGroup {
  id: string;
  name: string;
  team_id: string | null;
  leader_user_id: string | null;
}

export interface TeamManagementTeam {
  id: string;
  name: string;
}

export type TeamManagementAccess =
  | {
      level: "owner";
      canView: true;
      canEditGroups: true;
      teamIds: null;
      groupIds: null;
    }
  | {
      level: "team_admin";
      canView: true;
      canEditGroups: true;
      teamIds: string[];
      groupIds: null;
    }
  | {
      level: "group_leader";
      canView: true;
      canEditGroups: false;
      teamIds: string[];
      groupIds: string[];
    }
  | {
      level: "none";
      canView: false;
      canEditGroups: false;
      teamIds: [];
      groupIds: [];
    };

export function isIgnoredTeamManagementUser(profile: Pick<TeamManagementProfile, "name" | "email">) {
  const name = profile.name.trim().toLowerCase();
  const email = profile.email?.trim().toLowerCase() ?? "";

  return name.includes("codex") || email.endsWith("@dydata.local");
}

export function isTeamAdmin(profile: Pick<TeamManagementProfile, "role" | "permissions">) {
  return profile.role === "admin" && profile.permissions?.manage_members === true;
}

export function resolveTeamManagementAccess(
  actor: TeamManagementProfile,
  groups: TeamManagementGroup[],
): TeamManagementAccess {
  if (actor.role === "owner") {
    return {
      level: "owner",
      canView: true,
      canEditGroups: true,
      teamIds: null,
      groupIds: null,
    };
  }

  if (isTeamAdmin(actor) && actor.team_id) {
    return {
      level: "team_admin",
      canView: true,
      canEditGroups: true,
      teamIds: [actor.team_id],
      groupIds: null,
    };
  }

  if (actor.role === "admin") {
    const leaderGroups = groups.filter((group) => group.leader_user_id === actor.id);
    const teamIds = Array.from(
      new Set(
        [...leaderGroups.map((group) => group.team_id), actor.team_id].filter(
          (teamId): teamId is string => Boolean(teamId),
        ),
      ),
    );

    if (leaderGroups.length > 0) {
      return {
        level: "group_leader",
        canView: true,
        canEditGroups: false,
        teamIds,
        groupIds: leaderGroups.map((group) => group.id),
      };
    }
  }

  return {
    level: "none",
    canView: false,
    canEditGroups: false,
    teamIds: [],
    groupIds: [],
  };
}

export function canAccessTeam(access: TeamManagementAccess, teamId: string | null | undefined) {
  if (!access.canView) return false;
  if (access.teamIds === null) return true;
  return Boolean(teamId && access.teamIds.includes(teamId));
}

export function canAccessGroup(access: TeamManagementAccess, group: TeamManagementGroup) {
  if (!access.canView) return false;
  if (access.groupIds !== null) return access.groupIds.includes(group.id);
  return canAccessTeam(access, group.team_id);
}

export function canManageGroup(access: TeamManagementAccess, group: TeamManagementGroup) {
  return access.canEditGroups && canAccessGroup(access, group);
}

export function canAssignMemberToGroup(
  access: TeamManagementAccess,
  member: TeamManagementProfile,
  group: TeamManagementGroup | null,
) {
  if (!access.canEditGroups || member.role !== "member") return false;

  if (group) {
    return canManageGroup(access, group) && member.team_id === group.team_id;
  }

  return canAccessTeam(access, member.team_id);
}

export function canUseLeaderCandidate(
  access: TeamManagementAccess,
  candidate: TeamManagementProfile,
  teamId: string,
) {
  return (
    access.canEditGroups &&
    candidate.role === "admin" &&
    candidate.team_id === teamId &&
    candidate.permissions?.manage_members !== true &&
    canAccessTeam(access, teamId) &&
    !isIgnoredTeamManagementUser(candidate)
  );
}

export function filterVisibleTeamManagementProfiles(
  access: TeamManagementAccess,
  profiles: TeamManagementProfile[],
  groups: TeamManagementGroup[],
) {
  if (!access.canView) return [];
  if (access.level === "owner" || access.level === "team_admin") {
    return profiles.filter((profile) => canAccessTeam(access, profile.team_id));
  }
  if (access.level === "group_leader") {
    return profiles.filter((profile) => canAccessTeam(access, profile.team_id));
  }
  return [];
}
