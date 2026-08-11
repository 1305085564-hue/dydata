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
}

function normalizeQuery(value: string) {
  return value.toLowerCase().trim();
}

export function getVisibleTeamOptions({
  isOwner,
  allTeams,
  manageableTeams,
}: {
  isOwner: boolean;
  allTeams: TeamViewTeamOption[];
  manageableTeams: TeamViewTeamOption[];
}) {
  return isOwner ? allTeams : manageableTeams;
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
