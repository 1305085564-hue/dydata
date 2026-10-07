/* eslint-disable react-hooks/set-state-in-effect -- local optimistic workspace mirrors refreshed server props by design. */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMemberEmails } from "@/lib/modules/data/member-emails";
import { resolveProfileCompanyRoleForView } from "@/lib/modules/domain/view-rules";
import type { ProfileSummary, PendingRequest, TeamOption } from "@/lib/modules/types";
import { findFocusMember } from "@/lib/admin/find-focus-member";
import type { OrphanExemptionRequest } from "@/lib/exemption-orphan";
import type { WorkGroupRow, WorkGroupRosterMember } from "@/lib/work-groups";
import type { CompanyRole, Permissions } from "@/types";
import {
  ALL_TEAMS_ID,
  filterProfilesForMemberView,
  getSelectableCurrentScreenMemberIds,
  resolveDefaultSelectedTeamId,
  buildMemberWorkspaceHref,
  isMemberTargetReadOnly,
  resolveMemberWorkspaceState,
  retainSelectableMemberIds,
  resolveSelectedTeamAfterTeamDelete,
  type TeamViewTeamOption,
} from "./team-view-logic";

export type MemberWorkspaceInput = {
  currentUserId: string;
  allProfiles: ProfileSummary[];
  initialArchivedProfiles: ProfileSummary[];
  visibleTeamOptions: TeamViewTeamOption[];
  initialPendingRequests: PendingRequest[];
  initialOrphanExemptionRequests: OrphanExemptionRequest[];
  initialOrphanExemptionCount: number;
  initialWorkGroups: WorkGroupRow[];
  initialWorkGroupRoster: WorkGroupRosterMember[];
  focusMemberId?: string;
  initialMemberView?: string;
  initialTeamId?: string;
  initialSearchQuery?: string;
  isOwner: boolean;
  isGroupMode: boolean;
  onMemberOpened?: () => void;
  onMemberClosed?: () => void;
};

export function useMemberWorkspace(input: MemberWorkspaceInput) {
  const { currentUserId, onMemberOpened, onMemberClosed } = input;
  const initialSelectedTeamId = resolveDefaultSelectedTeamId({
    currentUserId: input.currentUserId,
    profiles: input.allProfiles,
    visibleTeams: input.visibleTeamOptions,
    isOwner: input.isOwner,
    groupMode: input.isGroupMode,
  });
  const initialWorkspaceState = resolveMemberWorkspaceState({
    params: {
      view: input.initialMemberView,
      team: input.initialTeamId,
      q: input.initialSearchQuery,
      member: input.focusMemberId,
    },
    visibleTeamIds: input.visibleTeamOptions.map((team) => team.id),
    defaultTeamId: initialSelectedTeamId,
  });

  const [localTeams, setLocalTeams] = useState<TeamOption[]>(input.visibleTeamOptions);
  const [localProfiles, setLocalProfiles] = useState<ProfileSummary[]>(input.allProfiles);
  const [localArchivedProfiles, setLocalArchivedProfiles] = useState<ProfileSummary[]>(input.initialArchivedProfiles);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(input.initialPendingRequests);
  const [orphanExemptionRequests, setOrphanExemptionRequests] = useState<OrphanExemptionRequest[]>(input.initialOrphanExemptionRequests);
  const [orphanExemptionCount, setOrphanExemptionCount] = useState(input.initialOrphanExemptionCount);
  const [memberView, setMemberView] = useState<"active" | "archived">(initialWorkspaceState.view);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialWorkspaceState.team);
  const [searchQuery, setSearchQuery] = useState(initialWorkspaceState.query);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [restoredFocusId, setRestoredFocusId] = useState<string | null>(null);
  const [localWorkGroups, setLocalWorkGroups] = useState<WorkGroupRow[]>(input.initialWorkGroups);
  const [localWorkGroupRoster, setLocalWorkGroupRoster] = useState<WorkGroupRosterMember[]>(input.initialWorkGroupRoster);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Permissions>({});

  useEffect(() => {
    setLocalProfiles(input.allProfiles);
    setLocalArchivedProfiles(input.initialArchivedProfiles);
  }, [input.allProfiles, input.initialArchivedProfiles]);

  useEffect(() => {
    setLocalTeams(input.visibleTeamOptions);
  }, [input.visibleTeamOptions]);

  useEffect(() => {
    setPendingRequests(input.initialPendingRequests);
  }, [input.initialPendingRequests]);

  useEffect(() => {
    setOrphanExemptionRequests(input.initialOrphanExemptionRequests);
    setOrphanExemptionCount(input.initialOrphanExemptionCount);
  }, [input.initialOrphanExemptionRequests, input.initialOrphanExemptionCount]);

  useEffect(() => {
    setLocalWorkGroups(input.initialWorkGroups);
  }, [input.initialWorkGroups]);

  useEffect(() => {
    setLocalWorkGroupRoster(input.initialWorkGroupRoster);
  }, [input.initialWorkGroupRoster]);

  useEffect(() => {
    if (selectedTeamId !== ALL_TEAMS_ID && !localTeams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(ALL_TEAMS_ID);
    }
  }, [localTeams, selectedTeamId]);

  const hasFetchedEmails = useRef(false);
  useEffect(() => {
    if (hasFetchedEmails.current) return;
    hasFetchedEmails.current = true;
    let active = true;
    async function loadEmails() {
      const emails = await fetchMemberEmails();
      if (emails && active) {
        setLocalProfiles((prev) => prev.map((profile) => ({ ...profile, email: emails[profile.id] ?? profile.email })));
      }
    }
    void loadEmails();
    return () => {
      active = false;
    };
  }, []);

  const profilesForCurrentView = memberView === "archived" ? localArchivedProfiles : localProfiles;
  const filteredProfiles = useMemo(
    () => filterProfilesForMemberView({
      profiles: profilesForCurrentView,
      memberView,
      selectedTeamId,
      searchQuery,
    }) as ProfileSummary[],
    [profilesForCurrentView, memberView, selectedTeamId, searchQuery],
  );
  const sortedProfiles = useMemo(() => {
    const roleRank: Record<CompanyRole, number> = { company_owner: 1, admin: 2, member: 3 };
    return [...filteredProfiles].sort((a, b) => {
      const aRole = resolveProfileCompanyRoleForView(a);
      const bRole = resolveProfileCompanyRoleForView(b);
      return (aRole ? roleRank[aRole] : 9) - (bRole ? roleRank[bRole] : 9);
    });
  }, [filteredProfiles]);
  const selectableFilteredMemberIds = useMemo(
    () => getSelectableCurrentScreenMemberIds(filteredProfiles, currentUserId),
    [filteredProfiles, currentUserId],
  );

  useEffect(() => {
    setSelectedMemberIds((previous) => {
      const next = retainSelectableMemberIds(previous, selectableFilteredMemberIds);
      return next.length === previous.length ? previous : next;
    });
  }, [selectableFilteredMemberIds]);

  const activeMember = useMemo(() => {
    if (!activeMemberId) return null;
    return localProfiles.find((profile) => profile.id === activeMemberId)
      ?? localArchivedProfiles.find((profile) => profile.id === activeMemberId)
      ?? null;
  }, [activeMemberId, localArchivedProfiles, localProfiles]);
  const activeMemberIsReadOnly = activeMember
    ? isMemberTargetReadOnly(activeMember, currentUserId)
    : true;
  const activeMemberCompanyRole = activeMember ? resolveProfileCompanyRoleForView(activeMember) : null;
  const activeMemberRoster = activeMember
    ? localWorkGroupRoster.find((roster) => roster.id === activeMember.id)
    : null;
  const activeMemberPeerGroup = activeMemberRoster?.peerGroupId
    ? localWorkGroups.find((group) => group.id === activeMemberRoster.peerGroupId)
    : null;
  const activeMemberOperatorGroup = activeMemberRoster?.operatorGroupId
    ? localWorkGroups.find((group) => group.id === activeMemberRoster.operatorGroupId)
    : null;
  const availablePeerGroups = activeMember?.team_id
    ? localWorkGroups.filter((group) => group.teamId === activeMember.team_id && (group.kind === "writer" || group.kind === "talent"))
    : [];
  const availableOperatorGroups = activeMember?.team_id
    ? localWorkGroups.filter((group) => group.teamId === activeMember.team_id && group.kind === "operator")
    : [];

  const replaceWorkspaceUrl = useCallback(
    (next: Partial<{ view: "active" | "archived"; team: string; query: string; memberId: string | null }>) => {
      window.history.replaceState(
        null,
        "",
        buildMemberWorkspaceHref({
          view: next.view ?? memberView,
          team: next.team ?? selectedTeamId,
          query: next.query ?? searchQuery,
          memberId: next.memberId === undefined ? activeMemberId : next.memberId,
        }),
      );
    },
    [activeMemberId, memberView, searchQuery, selectedTeamId],
  );

  const openMemberDrawer = useCallback(
    (member: ProfileSummary, syncUrl = true) => {
      setActiveMemberId(member.id);
      setDraftPermissions(member.permissions ?? {});
      onMemberOpened?.();
      if (syncUrl) {
        window.history.replaceState(
          null,
          "",
          buildMemberWorkspaceHref({
            view: memberView,
            team: selectedTeamId,
            query: searchQuery,
            memberId: member.id,
          }),
        );
      }
    },
    [memberView, onMemberOpened, searchQuery, selectedTeamId],
  );

  const closeMemberDrawer = useCallback(() => {
    setActiveMemberId(null);
    onMemberClosed?.();
    replaceWorkspaceUrl({ memberId: null });
  }, [onMemberClosed, replaceWorkspaceUrl]);

  const appliedFocusMemberId = useRef<string | null>(null);
  useEffect(() => {
    if (!input.focusMemberId) {
      if (appliedFocusMemberId.current) {
        appliedFocusMemberId.current = null;
        setActiveMemberId(null);
        onMemberClosed?.();
      }
      return;
    }
    if (appliedFocusMemberId.current === input.focusMemberId) return;
    const member = findFocusMember([...localProfiles, ...localArchivedProfiles], input.focusMemberId);
    if (!member) return;
    appliedFocusMemberId.current = input.focusMemberId;
    if (member.membership_status === "archived") setMemberView("archived");
    openMemberDrawer(member, false);
  }, [input.focusMemberId, localArchivedProfiles, localProfiles, onMemberClosed, openMemberDrawer]);

  return {
    localTeams,
    setLocalTeams,
    localProfiles,
    setLocalProfiles,
    localArchivedProfiles,
    setLocalArchivedProfiles,
    pendingRequests,
    setPendingRequests,
    orphanExemptionRequests,
    setOrphanExemptionRequests,
    orphanExemptionCount,
    setOrphanExemptionCount,
    memberView,
    setMemberView,
    selectedTeamId,
    setSelectedTeamId,
    searchQuery,
    setSearchQuery,
    selectedMemberIds,
    setSelectedMemberIds,
    restoredFocusId,
    setRestoredFocusId,
    localWorkGroups,
    setLocalWorkGroups,
    localWorkGroupRoster,
    setLocalWorkGroupRoster,
    activeMemberId,
    setActiveMemberId,
    draftPermissions,
    setDraftPermissions,
    profilesForCurrentView,
    filteredProfiles,
    sortedProfiles,
    selectableFilteredMemberIds,
    activeMember,
    activeMemberIsReadOnly,
    activeMemberCompanyRole,
    activeMemberRoster,
    activeMemberPeerGroup,
    activeMemberOperatorGroup,
    availablePeerGroups,
    availableOperatorGroups,
    replaceWorkspaceUrl,
    openMemberDrawer,
    closeMemberDrawer,
    resolveSelectedTeamAfterTeamDelete,
  };
}
