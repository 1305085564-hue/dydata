export const ALL_TEAMS_ID = "__all__" as const;

export type MemberView = "active" | "archived";
export type TeamFilterId = string | typeof ALL_TEAMS_ID;

export interface TeamViewTeamOption {
  id: string;
  name: string;
}

export interface TeamViewProfile {
  id: string;
  name?: string | null;
  email?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: Record<string, unknown> | null;
  status?: string | null;
  exempt_type?: string | null;
  exempt_start_date?: string | null;
  exempt_end_date?: string | null;
}

function normalizeQuery(value: string) {
  return value.toLowerCase().trim();
}

export function getVisibleTeamOptions({
  isOwner,
  groupMode,
  allTeams,
  manageableTeams,
}: {
  isOwner?: boolean;
  groupMode?: boolean;
  allTeams: TeamViewTeamOption[];
  manageableTeams: TeamViewTeamOption[];
}) {
  if (groupMode !== undefined) {
    return groupMode ? allTeams : manageableTeams;
  }
  return isOwner ? allTeams : manageableTeams;
}

export function resolveDefaultSelectedTeamId({
  currentUserId,
  profiles,
  visibleTeams,
  isOwner,
  groupMode,
}: {
  currentUserId: string;
  profiles: TeamViewProfile[];
  visibleTeams: TeamViewTeamOption[];
  isOwner?: boolean;
  groupMode?: boolean;
}): TeamFilterId {
  const visibleTeamIds = new Set(visibleTeams.map((team) => team.id));
  const currentUserTeamId = profiles.find((profile) => profile.id === currentUserId)?.team_id ?? null;

  if (currentUserTeamId && visibleTeamIds.has(currentUserTeamId)) {
    return currentUserTeamId;
  }

  const isGroup = groupMode ?? isOwner;
  if (!isGroup && visibleTeams.length === 1) {
    return visibleTeams[0]?.id ?? ALL_TEAMS_ID;
  }

  return ALL_TEAMS_ID;
}

export function isProfileExemptOnDate(profile: TeamViewProfile, date: string) {
  if (profile.exempt_type === "permanent" || profile.status === "exempt") {
    return true;
  }

  return Boolean(
    profile.exempt_type === "temporary" &&
      profile.exempt_start_date &&
      profile.exempt_end_date &&
      profile.exempt_start_date <= date &&
      date <= profile.exempt_end_date,
  );
}

export function getArchivedTeamId(profile: TeamViewProfile) {
  const snapshotTeamId = profile.archive_snapshot?.team_id;
  if (typeof snapshotTeamId === "string" && snapshotTeamId.trim()) {
    return snapshotTeamId;
  }
  return profile.team_id ?? null;
}

export function getProfileTeamIdForView(profile: TeamViewProfile, memberView: MemberView) {
  return memberView === "archived" ? getArchivedTeamId(profile) : profile.team_id ?? null;
}

export function getArchivedTeamName(profile: TeamViewProfile) {
  const snapshotTeamName = profile.archive_snapshot?.team_name;
  if (typeof snapshotTeamName === "string" && snapshotTeamName.trim()) {
    return snapshotTeamName;
  }
  return profile.team_name ?? null;
}

export function profileMatchesSearch(profile: TeamViewProfile, memberView: MemberView, searchQuery: string) {
  const query = normalizeQuery(searchQuery);
  if (!query) return true;

  const teamName = memberView === "archived" ? getArchivedTeamName(profile) : profile.team_name;
  return [profile.name ?? "", profile.email ?? "", teamName ?? "", profile.archive_reason ?? ""].some((value) =>
    value.toLowerCase().includes(query),
  );
}

export function filterProfilesForMemberView({
  profiles,
  memberView,
  selectedTeamId,
  searchQuery,
}: {
  profiles: TeamViewProfile[];
  memberView: MemberView;
  selectedTeamId: TeamFilterId;
  searchQuery: string;
}) {
  return profiles.filter((profile) => {
    if (selectedTeamId !== ALL_TEAMS_ID && getProfileTeamIdForView(profile, memberView) !== selectedTeamId) {
      return false;
    }
    return profileMatchesSearch(profile, memberView, searchQuery);
  });
}

export function countProfilesInTeamForView(
  profiles: TeamViewProfile[],
  memberView: MemberView,
  teamId: string,
) {
  return profiles.filter((profile) => getProfileTeamIdForView(profile, memberView) === teamId).length;
}

export function getSelectableCurrentScreenMemberIds(profiles: TeamViewProfile[], currentUserId: string) {
  return profiles.filter((profile) => profile.id !== currentUserId).map((profile) => profile.id);
}

export function retainSelectableMemberIds(selectedMemberIds: string[], selectableMemberIds: string[]) {
  if (selectedMemberIds.length === 0) return selectedMemberIds;
  const selectable = new Set(selectableMemberIds);
  return selectedMemberIds.filter((id) => selectable.has(id));
}

export function resolveSelectedTeamAfterTeamDelete(selectedTeamId: TeamFilterId, deletedTeamId: string): TeamFilterId {
  return selectedTeamId === deletedTeamId ? ALL_TEAMS_ID : selectedTeamId;
}


export function formatLastLoginDisplay(
  dateStr?: string | null,
  now: Date = new Date(),
): { text: string; isLoginStale: boolean } {
  if (!dateStr) return { text: "从未登录（疑似未激活）", isLoginStale: true };

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return { text: "未知登录时间", isLoginStale: false };

  const diffDays = Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
  const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (diffDays > 30) {
    return { text: `${formatted}（距上次登录 ${diffDays} 天）`, isLoginStale: true };
  }

  return { text: formatted, isLoginStale: false };
}
