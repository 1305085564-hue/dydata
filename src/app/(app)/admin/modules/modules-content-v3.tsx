"use client";

import {
  useState,
  useEffect,
  useTransition,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import type { AdminModulesContentProps, PendingRequest, ProfileSummary, TeamOption } from "@/lib/modules/types";
import { resolveProfileCompanyRoleForView } from "@/lib/modules/domain/view-rules";
import { fetchMemberEmails } from "@/lib/modules/data/member-emails";
import { MemberAlerts } from "@/components/modules/member-alerts";
import { MemberBatchActions } from "@/components/modules/member-batch-actions";
import { MemberInspector } from "@/components/modules/member-inspector";
import { MemberTable } from "@/components/modules/member-table";
import { MemberToolbar } from "@/components/modules/member-toolbar";
import { ModuleDialogs } from "@/components/modules/module-dialogs";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getRoleLabel } from "@/lib/role-label";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { CompanyRole, Permissions } from "@/types";
import {
  resolvePermanentExemptionState,
  validatePermanentExemptionReason,
  requestSetPermanentExemption,
  requestClearPermanentExemption,
} from "./permanent-exemption-logic";

import {
  createTeam,
  deleteTeam,
  changeRole,
  resetMemberPassword,
  updateMemberTeam,
  assignOrphanExemptionMember,
  rejectOrphanExemptionRequest,
  archiveMember,
  restoreMember,
} from "../actions";

import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "../join-request-actions";

import {
  assignWorkGroupMemberAction,
  unassignWorkGroupMemberAction,
} from "../collaboration/work-group-actions";
import { describeAssignSuccess } from "../collaboration/work-group-membership-copy";
import { resolveWorkGroupAssignOutcome } from "@/lib/work-group-assign-outcome";
import type { OrphanExemptionRequest } from "@/lib/exemption-orphan";
import type { WorkGroupRow, WorkGroupRosterMember } from "@/lib/work-groups";

import { findFocusMember } from "@/lib/admin/find-focus-member";
import type { AiSuggestionItem, MemberAiSuggestionState, ToolConfirmationState } from "./member-ai-dialogs";

import {
  ALL_TEAMS_ID,
  filterProfilesForMemberView,
  getSelectableCurrentScreenMemberIds,
  getVisibleTeamOptions,
  resolveDefaultSelectedTeamId,
  buildMemberWorkspaceHref,
  isMemberTargetReadOnly,
  resolveMemberWorkspaceState,
  retainSelectableMemberIds,
  resolveSelectedTeamAfterTeamDelete,
  type TeamViewTeamOption,
} from "./team-view-logic";

export type { AdminModulesContentProps, PendingRequest, ProfileSummary, TeamOption } from "@/lib/modules/types";

/* ─── Main Component ─── */

export function AdminModulesContentV3({
  currentUserId,
  currentUserRole,
  currentUserBusinessRole,
  currentUserCompanyRole,
  currentUserGroupMode,
  currentUserPermissions = {},
  permissionManagerCapabilities,
  allProfiles,
  archivedProfiles: initialArchivedProfiles = [],
  teams: initialTeams,
  teamManagement,
  pendingRequests: initialPendingRequests,
  orphanExemptionRequests: initialOrphanExemptionRequests,
  orphanExemptionCount: initialOrphanExemptionCount,
  workGroups: initialWorkGroups = [],
  workGroupRoster: initialWorkGroupRoster = [],
  focusMemberId,
  initialMemberView,
  initialTeamId,
  initialSearchQuery,
}: AdminModulesContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 1. Permission & access context
  const currentRoleValue = currentUserBusinessRole ?? (
    currentUserCompanyRole === "company_owner" && currentUserRole === "admin"
      ? currentUserCompanyRole
      : currentUserRole
  );
  const currentRoleResolution = resolveProfileCompanyRole(currentRoleValue, currentUserCompanyRole);
  const currentCompanyRole = currentRoleResolution.conflict ? null : currentRoleResolution.companyRole;
  const hasResolvedActorRole = currentCompanyRole !== null;
  const isGroupMode = currentCompanyRole === "company_owner" && currentUserGroupMode === true;
  const isOwner = currentCompanyRole === "company_owner";
  const isCompanyOwner = currentCompanyRole === "company_owner";
  const isTeamAdmin = currentCompanyRole === "admin" && currentUserPermissions.manage_members === true;
  const canManageCompany = isCompanyOwner || isGroupMode;
  const canManageTeamStructure = isCompanyOwner && isGroupMode;
  const canManageMembers =
    hasResolvedActorRole && (
      canManageCompany ||
      permissionManagerCapabilities.canEditPermissions ||
      currentUserPermissions.manage_members === true
    );
  const canEditTeamMembers = hasResolvedActorRole && (teamManagement.access.canEditMembers || canManageMembers);
  const canManageLifecycle = canManageCompany || isTeamAdmin;
  const canArchiveTarget = (target: ProfileSummary) =>
    canManageLifecycle && !isMemberTargetReadOnly(target, currentUserId) &&
    (() => {
      const targetCompanyRole = resolveProfileCompanyRoleForView(target);
      return targetCompanyRole !== null &&
        (isCompanyOwner || isGroupMode || targetCompanyRole !== "admin");
    })();

  // 2. Compute strictly visible teams according to user data access scope and role
  const visibleTeamOptions: TeamViewTeamOption[] = useMemo(() => {
    return getVisibleTeamOptions({
      isOwner,
      groupMode: isGroupMode,
      allTeams: initialTeams,
      manageableTeams: teamManagement.teams,
    });
  }, [isOwner, isGroupMode, initialTeams, teamManagement.teams]);

  const initialSelectedTeamId = resolveDefaultSelectedTeamId({
    currentUserId,
    profiles: allProfiles,
    visibleTeams: visibleTeamOptions,
    isOwner,
    groupMode: isGroupMode,
  });
  const initialWorkspaceState = resolveMemberWorkspaceState({
    params: {
      view: initialMemberView,
      team: initialTeamId,
      q: initialSearchQuery,
      member: focusMemberId,
    },
    visibleTeamIds: visibleTeamOptions.map((team) => team.id),
    defaultTeamId: initialSelectedTeamId,
  });

  // 3. Main view states
  const [localTeams, setLocalTeams] = useState<TeamOption[]>(visibleTeamOptions);
  const [localProfiles, setLocalProfiles] = useState<ProfileSummary[]>(allProfiles);
  const [localArchivedProfiles, setLocalArchivedProfiles] = useState<ProfileSummary[]>(initialArchivedProfiles);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(initialPendingRequests);
  const [orphanExemptionRequests, setOrphanExemptionRequests] = useState<OrphanExemptionRequest[]>(initialOrphanExemptionRequests);
  const [orphanExemptionCount, setOrphanExemptionCount] = useState(initialOrphanExemptionCount);
  const [memberView, setMemberView] = useState<"active" | "archived">(initialWorkspaceState.view);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialWorkspaceState.team);
  const [searchQuery, setSearchQuery] = useState(initialWorkspaceState.query);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [restoredFocusId, setRestoredFocusId] = useState<string | null>(null);
  const [localWorkGroups, setLocalWorkGroups] = useState<WorkGroupRow[]>(initialWorkGroups);
  const [localWorkGroupRoster, setLocalWorkGroupRoster] = useState<WorkGroupRosterMember[]>(initialWorkGroupRoster);

  // 4. Drawer (Inspector) states
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Permissions>({});


  // AI Suggestion state
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<MemberAiSuggestionState | null>(null);
  const [executingAiKey, setExecutingAiKey] = useState<string | null>(null);
  const [toolConfirmationModal, setToolConfirmationModal] = useState<ToolConfirmationState | null>(null);

  // Dialog states
  const [teamManagementDialogOpen, setTeamManagementDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<TeamOption | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] = useState<ProfileSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<ProfileSummary | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<ProfileSummary | null>(null);
  const [batchArchiveOpen, setBatchArchiveOpen] = useState(false);
  const [batchArchiveReason, setBatchArchiveReason] = useState("");
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    memberId: string;
    memberName: string;
    targetRole: "member" | "admin";
  } | null>(null);
  const [setPermanentTarget, setSetPermanentTarget] = useState<ProfileSummary | null>(null);
  const [permanentReason, setPermanentReason] = useState("");
  const [permanentReasonError, setPermanentReasonError] = useState<string | null>(null);
  const [clearPermanentTarget, setClearPermanentTarget] = useState<ProfileSummary | null>(null);
  const [isPermanentSubmitting, setIsPermanentSubmitting] = useState(false);

  // Sync props → state
  useEffect(() => {
    setLocalProfiles(allProfiles);
    setLocalArchivedProfiles(initialArchivedProfiles);
  }, [allProfiles, initialArchivedProfiles]);

  useEffect(() => {
    setLocalTeams(visibleTeamOptions);
  }, [visibleTeamOptions]);

  useEffect(() => {
    setPendingRequests(initialPendingRequests);
  }, [initialPendingRequests]);

  useEffect(() => {
    setOrphanExemptionRequests(initialOrphanExemptionRequests);
    setOrphanExemptionCount(initialOrphanExemptionCount);
  }, [initialOrphanExemptionRequests, initialOrphanExemptionCount]);

  useEffect(() => {
    setLocalWorkGroups(initialWorkGroups);
  }, [initialWorkGroups]);

  useEffect(() => {
    setLocalWorkGroupRoster(initialWorkGroupRoster);
  }, [initialWorkGroupRoster]);

  useEffect(() => {
    if (selectedTeamId !== ALL_TEAMS_ID && !localTeams.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(ALL_TEAMS_ID);
    }
  }, [localTeams, selectedTeamId]);

  // Background fetch latest emails
  const hasFetchedEmails = useRef(false);
  useEffect(() => {
    if (hasFetchedEmails.current) return;
    hasFetchedEmails.current = true;
    let active = true;
    async function fetchEmails() {
      const emails = await fetchMemberEmails();
      if (emails && active) {
        setLocalProfiles((prev) =>
          prev.map((p) => ({ ...p, email: emails[p.id] ?? p.email }))
        );
      }
    }
    void fetchEmails();
    return () => {
      active = false;
    };
  }, []);

  // Filtered & Sorted profiles
  const profilesForCurrentView = memberView === "archived" ? localArchivedProfiles : localProfiles;

  const filteredProfiles = useMemo(() => {
    return filterProfilesForMemberView({
      profiles: profilesForCurrentView,
      memberView,
      selectedTeamId,
      searchQuery,
    }) as ProfileSummary[];
  }, [profilesForCurrentView, memberView, selectedTeamId, searchQuery]);

  const sortedProfiles = useMemo(() => {
    const list = [...filteredProfiles];
    const roleRank: Record<CompanyRole, number> = { company_owner: 1, admin: 2, member: 3 };
    list.sort((a, b) => {
      const aRole = resolveProfileCompanyRoleForView(a);
      const bRole = resolveProfileCompanyRoleForView(b);
      return (aRole ? roleRank[aRole] : 9) - (bRole ? roleRank[bRole] : 9);
    });
    return list;
  }, [filteredProfiles]);

  const selectableFilteredMemberIds = useMemo(() => {
    return getSelectableCurrentScreenMemberIds(filteredProfiles, currentUserId);
  }, [filteredProfiles, currentUserId]);

  useEffect(() => {
    setSelectedMemberIds((prev) => {
      const next = retainSelectableMemberIds(prev, selectableFilteredMemberIds);
      return next.length === prev.length ? prev : next;
    });
  }, [selectableFilteredMemberIds]);

  // Active member inside Drawer
  const activeMember = useMemo(() => {
    if (!activeMemberId) return null;
    return (
      localProfiles.find((p) => p.id === activeMemberId) ||
      localArchivedProfiles.find((p) => p.id === activeMemberId) ||
      null
    );
  }, [localProfiles, localArchivedProfiles, activeMemberId]);
  const activeMemberExemptionState = resolvePermanentExemptionState(activeMember);
  const activeMemberIsReadOnly = activeMember
    ? isMemberTargetReadOnly(activeMember, currentUserId)
    : true;
  const activeMemberCompanyRole = activeMember
    ? resolveProfileCompanyRoleForView(activeMember)
    : null;

  const canEditActiveMemberTeam =
    Boolean(activeMember) && !activeMemberIsReadOnly &&
    (canManageCompany || (canEditTeamMembers && activeMemberCompanyRole === "member"));
  const canManageActiveMemberAccount =
    Boolean(activeMember) && !activeMemberIsReadOnly &&
    (canManageCompany || (canManageMembers && activeMemberCompanyRole === "member"));

  const canEditWorkGroups =
    Boolean(activeMember) && !activeMemberIsReadOnly &&
    (canManageCompany || currentUserPermissions.manage_members === true);

  const activeMemberRoster = activeMember
    ? localWorkGroupRoster.find((r) => r.id === activeMember.id)
    : null;
  const activeMemberPeerGroup = activeMemberRoster?.peerGroupId
    ? localWorkGroups.find((g) => g.id === activeMemberRoster.peerGroupId)
    : null;
  const activeMemberOperatorGroup = activeMemberRoster?.operatorGroupId
    ? localWorkGroups.find((g) => g.id === activeMemberRoster.operatorGroupId)
    : null;
  const availablePeerGroups = activeMember?.team_id
    ? localWorkGroups.filter((g) => g.teamId === activeMember.team_id && (g.kind === "writer" || g.kind === "talent"))
    : [];
  const availableOperatorGroups = activeMember?.team_id
    ? localWorkGroups.filter((g) => g.teamId === activeMember.team_id && g.kind === "operator")
    : [];

  const replaceWorkspaceUrl = useCallback(
    (next: Partial<{ view: "active" | "archived"; team: string; query: string; memberId: string | null }>) => {
      // 页内切换的客户端 state 已在各调用点各自 set（view/team/query/member），这里只镜像地址栏，
      // 保留"可分享/刷新回默认"。用 history.replaceState 不入栈、不触发服务端导航：
      // 搜索逐字符、换团队、在职↔归档页签不再把整份名单从服务器重拉一遍（服务器只按 date 取数，重取回的是同一份）。
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

  // Open Drawer & initialize state
  const openMemberDrawer = useCallback(
    (member: ProfileSummary, syncUrl = true) => {
      setActiveMemberId(member.id);
      setDraftPermissions(member.permissions ?? {});
      setAiSuggestion(null);
      setIsAiDialogOpen(false);
      if (syncUrl) {
        // 开抽屉本身是纯客户端动作（setActiveMemberId 已即时打开），URL 只镜像地址栏、不入栈。
        // 用 replaceState 而非 router.push：不触发整份成员数据集的服务端重取。
        // 取舍（阿禅定）：后退键因此不再关抽屉，而是直接离开本页；如需"后退关抽屉"要改回 pushState（代价是一次服务端导航）。
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
    [memberView, searchQuery, selectedTeamId]
  );

  const closeMemberDrawer = useCallback(() => {
    setActiveMemberId(null);
    setAiSuggestion(null);
    replaceWorkspaceUrl({ memberId: null });
  }, [replaceWorkspaceUrl]);

  // Focus member from URL
  const appliedFocusMemberId = useRef<string | null>(null);
  useEffect(() => {
    if (!focusMemberId) {
      if (appliedFocusMemberId.current) {
        appliedFocusMemberId.current = null;
        setActiveMemberId(null);
        setAiSuggestion(null);
      }
      return;
    }
    if (appliedFocusMemberId.current === focusMemberId) return;
    const member = findFocusMember([...localProfiles, ...localArchivedProfiles], focusMemberId);
    if (!member) return;
    appliedFocusMemberId.current = focusMemberId;
    if (member.membership_status === "archived") setMemberView("archived");
    openMemberDrawer(member, false);
  }, [focusMemberId, localArchivedProfiles, localProfiles, openMemberDrawer]);

  // --- ACTIONS ---

  // 1. Team Management
  const handleCreateTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    const tempId = `temp-${Date.now()}`;
    setLocalTeams((prev) => [...prev, { id: tempId, name }]);
    setNewTeamName("");
    startTransition(async () => {
      const res = await createTeam(name);
      if (res.error) {
        setLocalTeams((prev) => prev.filter((t) => t.id !== tempId));
        setNewTeamName(name);
        feedbackToast.error("创建团队失败", { description: res.error });
      } else if (res.team) {
        setLocalTeams((prev) => prev.map((t) => (t.id === tempId ? res.team! : t)));
        feedbackToast.success(`已创建团队「${name}」`);
        router.refresh();
      }
    });
  };

  const handleDeleteTeam = (team: TeamOption) => {
    setDeleteTeamTarget(null);
    const hasMembers = localProfiles.some((p) => p.team_id === team.id);
    if (hasMembers) {
      feedbackToast.warning("该团队下还有在职成员，请先移出成员后再删除");
      return;
    }
    setLocalTeams((prev) => prev.filter((t) => t.id !== team.id));
    setSelectedTeamId((current) => resolveSelectedTeamAfterTeamDelete(current, team.id));
    startTransition(async () => {
      const res = await deleteTeam(team.id);
      if (res.error) {
        setLocalTeams((prev) => [...prev, team]);
        feedbackToast.error("删除团队失败", { description: res.error });
      } else {
        feedbackToast.success("团队已删除");
        router.refresh();
      }
    });
  };

  // 2. Member Team Transfer & Remove
  const handleTransferMemberTeam = (memberId: string, teamId: string | null) => {
    const prevProfiles = localProfiles;
    const targetTeam = localTeams.find((t) => t.id === teamId);
    const targetTeamName = targetTeam ? targetTeam.name : null;

    setLocalProfiles((prev) =>
      prev.map((p) => (p.id === memberId ? { ...p, team_id: teamId, team_name: targetTeamName } : p))
    );

    startTransition(async () => {
      const res = await updateMemberTeam(memberId, teamId);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error("调配团队失败", { description: res.error });
      } else {
        feedbackToast.success(teamId ? `已调配至 ${targetTeamName}` : "已移出当前团队");
        router.refresh();
      }
    });
  };

  const handleAssignPeerGroup = (targetGroupId: string) => {
    if (!activeMember) return;
    const currentGroupId = activeMemberRoster?.peerGroupId ?? null;
    if (currentGroupId === targetGroupId) return;

    const previousRoster = localWorkGroupRoster;
    const targetGroup = localWorkGroups.find((g) => g.id === targetGroupId);

    // Optimistic update
    setLocalWorkGroupRoster((prev) => {
      const exists = prev.some((m) => m.id === activeMember.id);
      if (!exists) {
        if (targetGroupId === "__none__" || !targetGroup) return prev;
        return [
          ...prev,
          {
            id: activeMember.id,
            name: activeMember.name,
            teamId: activeMember.team_id ?? null,
            peerGroupId: targetGroup.id,
            operatorGroupId: null,
          },
        ];
      }
      return prev.map((m) => {
        if (m.id !== activeMember.id) return m;
        return {
          ...m,
          peerGroupId: targetGroupId === "__none__" ? null : targetGroupId,
        };
      });
    });

    startTransition(async () => {
      if (targetGroupId === "__none__") {
        if (!currentGroupId) return;
        const unassignRes = await unassignWorkGroupMemberAction({
          groupId: currentGroupId,
          userId: activeMember.id,
        });
        if (!unassignRes.ok) {
          setLocalWorkGroupRoster(previousRoster);
          feedbackToast.error("取消原小队失败", { description: unassignRes.message });
          return;
        }
        feedbackToast.success("已移除工种小队");
        router.refresh();
        return;
      }

      // 换组（含文案↔达人）由服务端一次原子替换：原先「先取消再分配」的两步，
      // 一旦第二步失败成员就丢了原归属，且与小队抽屉的行为不一致。
      const assignRes = await assignWorkGroupMemberAction({
        groupId: targetGroupId,
        userId: activeMember.id,
      });
      const assignOutcome = resolveWorkGroupAssignOutcome("writer_peer", assignRes);
      if (assignOutcome.kind === "error") {
        setLocalWorkGroupRoster(previousRoster);
        feedbackToast.error(assignOutcome.title, { description: assignOutcome.description });
      } else {
        feedbackToast.success(
          describeAssignSuccess({
            groupName: targetGroup?.name ?? "小队",
            replacedGroupName: assignOutcome.replacedGroupName,
          }),
        );
        router.refresh();
      }
    });
  };

  const handleAssignOperatorGroup = (targetGroupId: string) => {
    if (!activeMember) return;
    const currentGroupId = activeMemberRoster?.operatorGroupId ?? null;
    if (currentGroupId === targetGroupId) return;

    const previousRoster = localWorkGroupRoster;
    const targetGroup = localWorkGroups.find((g) => g.id === targetGroupId);

    // Optimistic update
    setLocalWorkGroupRoster((prev) => {
      const exists = prev.some((m) => m.id === activeMember.id);
      if (!exists) {
        if (targetGroupId === "__none__" || !targetGroup) return prev;
        return [
          ...prev,
          {
            id: activeMember.id,
            name: activeMember.name,
            teamId: activeMember.team_id ?? null,
            peerGroupId: null,
            operatorGroupId: targetGroup.id,
          },
        ];
      }
      return prev.map((m) => {
        if (m.id !== activeMember.id) return m;
        return {
          ...m,
          operatorGroupId: targetGroupId === "__none__" ? null : targetGroupId,
        };
      });
    });

    startTransition(async () => {
      if (targetGroupId === "__none__") {
        if (!currentGroupId) return;
        const unassignRes = await unassignWorkGroupMemberAction({
          groupId: currentGroupId,
          userId: activeMember.id,
        });
        if (!unassignRes.ok) {
          setLocalWorkGroupRoster(previousRoster);
          feedbackToast.error("取消原运营小队失败", { description: unassignRes.message });
          return;
        }
        feedbackToast.success("已移除运营小队");
        router.refresh();
        return;
      }

      // 与工种小队同一套：换运营组由服务端原子替换，不先手动取消。
      const assignRes = await assignWorkGroupMemberAction({
        groupId: targetGroupId,
        userId: activeMember.id,
      });
      const assignOutcome = resolveWorkGroupAssignOutcome("operator", assignRes);
      if (assignOutcome.kind === "error") {
        setLocalWorkGroupRoster(previousRoster);
        feedbackToast.error(assignOutcome.title, { description: assignOutcome.description });
      } else {
        feedbackToast.success(
          describeAssignSuccess({
            groupName: targetGroup?.name ?? "小队",
            replacedGroupName: assignOutcome.replacedGroupName,
          }),
        );
        router.refresh();
      }
    });
  };

  // 3. Batch Team Transfer
  const handleBatchTransferTeam = (teamId: string) => {
    if (selectedMemberIds.length === 0) return;
    const targetTeam = localTeams.find((t) => t.id === teamId);
    const targetTeamName = targetTeam ? targetTeam.name : "未分配";
    const ids = [...selectedMemberIds];
    setSelectedMemberIds([]);

    startTransition(async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await updateMemberTeam(id, teamId || null);
            return { memberId: id, success: !res.error, error: res.error ?? null };
          } catch (error) {
            return {
              memberId: id,
              success: false,
              error: error instanceof Error ? error.message : "未知错误",
            };
          }
        }),
      );
      const succeeded = results.filter((result) => result.success);
      const failed = results.filter((result) => !result.success);

      if (succeeded.length > 0) {
        const succeededIds = new Set(succeeded.map((result) => result.memberId));
        setLocalProfiles((prev) =>
          prev.map((p) =>
            succeededIds.has(p.id) ? { ...p, team_id: teamId || null, team_name: targetTeamName } : p,
          ),
        );
        router.refresh();
      }

      if (failed.length > 0) {
        const failedNames = failed.map((result) => {
          const member = localProfiles.find((profile) => profile.id === result.memberId);
          return member?.name || "未知成员";
        });
        feedbackToast.warning(`调配失败 ${failed.length} 人`, {
          description: `失败成员：${failedNames.join("、")}`,
        });
      } else {
        feedbackToast.success(`已将 ${succeeded.length} 位成员调配至「${targetTeamName}」`);
      }
    });
  };

  // 4. Single & Batch Archive
  const handleArchiveMember = () => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    const reason = archiveReason.trim();
    if (!reason) {
      feedbackToast.warning("必须填写归档原因");
      return;
    }
    const previousProfiles = localProfiles;
    setArchiveTarget(null);
    setArchiveReason("");
    setLocalProfiles((prev) => prev.filter((p) => p.id !== target.id));
    if (activeMemberId === target.id) setActiveMemberId(null);

    startTransition(async () => {
      const res = await archiveMember(target.id, reason);
      if (res.error) {
        setLocalProfiles(previousProfiles);
        feedbackToast.error("归档失败", { description: res.error });
        return;
      }
      const archivedItem: ProfileSummary = {
        ...target,
        membership_status: "archived",
        archived_at: new Date().toISOString(),
        archive_reason: reason,
        archive_snapshot: {
          team_id: target.team_id,
          team_name: target.team_name,
          role: target.role,
          company_role: target.company_role ?? null,
        },
        team_id: null,
        team_name: null,
      };
      setLocalArchivedProfiles((prev) => [archivedItem, ...prev]);
      feedbackToast.success(`成员「${target.name}」已归档并封禁登录`);
      router.refresh();
    });
  };

  const handleBatchArchive = () => {
    if (selectedMemberIds.length === 0) return;
    const reason = batchArchiveReason.trim();
    if (!reason) {
      feedbackToast.warning("必须填写批量归档原因");
      return;
    }
    const ids = [...selectedMemberIds];
    const prevProfiles = localProfiles;
    setBatchArchiveOpen(false);
    setBatchArchiveReason("");

    startTransition(async () => {
      let failCount = 0;
      let lastErr = "";
      const successIds: string[] = [];

      for (const id of ids) {
        const res = await archiveMember(id, reason);
        if (res.error) {
          failCount++;
          lastErr = res.error;
        } else {
          successIds.push(id);
        }
      }

      if (successIds.length > 0) {
        const newlyArchived = prevProfiles
          .filter((p) => successIds.includes(p.id))
          .map((p) => ({
            ...p,
            membership_status: "archived" as const,
            archived_at: new Date().toISOString(),
            archive_reason: reason,
            archive_snapshot: {
              team_id: p.team_id,
              team_name: p.team_name,
              role: p.role,
              company_role: p.company_role ?? null,
            },
            team_id: null,
            team_name: null,
          }));
        setLocalProfiles((prev) => prev.filter((p) => !successIds.includes(p.id)));
        setLocalArchivedProfiles((prev) => [...newlyArchived, ...prev]);
      }
      setSelectedMemberIds([]);

      if (failCount > 0) {
        feedbackToast.warning(`部分账号归档完成：成功 ${successIds.length} 位，失败 ${failCount} 位`, {
          description: lastErr,
        });
      } else {
        feedbackToast.success(`成功批量归档 ${successIds.length} 位成员账号`);
      }
      router.refresh();
    });
  };

  // 5. Restore Member
  const handleRestoreMember = () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    const prevArchived = localArchivedProfiles;
    setRestoreTarget(null);
    setLocalArchivedProfiles((prev) => prev.filter((p) => p.id !== target.id));

    startTransition(async () => {
      const res = await restoreMember(target.id);
      if (res.error) {
        setLocalArchivedProfiles(prevArchived);
        feedbackToast.error("恢复账号失败", { description: res.error });
        return;
      }
      const restoredItem: ProfileSummary = {
        ...target,
        role: "member",
        company_role: "member",
        membership_status: "active",
        team_id: null,
        team_name: null,
        permissions: {},
      };
      setLocalProfiles((prev) => [...prev, restoredItem]);
      setMemberView("active");
      setSelectedTeamId(ALL_TEAMS_ID);
      setSearchQuery("");
      setRestoredFocusId(target.id);
      setTimeout(() => setRestoredFocusId(null), 3000);
      feedbackToast.success(`已恢复「${target.name}」为在职组员`);
      router.refresh();
    });
  };

  // 6. Role Switch (member <-> admin)
  const handleRoleChangeClick = (member: ProfileSummary) => {
    const memberCompanyRole = resolveProfileCompanyRoleForView(member);
    if (memberCompanyRole !== "member" && memberCompanyRole !== "admin") return;
    const newRole = memberCompanyRole === "admin" ? "member" : "admin";
    setRoleChangeConfirm({ memberId: member.id, memberName: member.name, targetRole: newRole });
  };

  const handleRoleChangeConfirm = () => {
    if (!roleChangeConfirm) return;
    const { memberId, targetRole } = roleChangeConfirm;
    const prevProfiles = localProfiles;
    setLocalProfiles((prev) =>
      prev.map((p) =>
        p.id === memberId
          ? {
              ...p,
              role: targetRole,
              company_role: targetRole,
              permissions: targetRole === "member" ? {} : p.permissions,
            }
          : p
      )
    );
    setRoleChangeConfirm(null);

    startTransition(async () => {
      const res = await changeRole(memberId, targetRole);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error("变更角色失败", { description: res.error });
      } else {
        feedbackToast.success(`角色已变更为「${getRoleLabel(targetRole)}」`);
        router.refresh();
      }
    });
  };

  // 8. Password Reset
  const handleResetPassword = () => {
    if (!passwordResetTarget) return;
    const target = passwordResetTarget;
    const pwd = newPassword.trim();
    if (pwd.length < 6) {
      feedbackToast.warning("密码长度不能少于 6 位");
      return;
    }
    startTransition(async () => {
      const res = await resetMemberPassword(target.id, pwd);
      if (res.error) {
        feedbackToast.error("重置密码失败", { description: res.error });
      } else {
        setPasswordResetTarget(null);
        setNewPassword("");
        feedbackToast.success(`已为「${target.name}」重置登录密码`);
      }
    });
  };

  // 10. Review Join Requests
  const handleReviewJoinRequest = (requestId: string, action: "approve" | "reject") => {
    const targetRequest = pendingRequests.find((r) => r.id === requestId);
    if (!targetRequest) return;
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));

    startTransition(async () => {
      const actionFn = action === "approve" ? approveJoinRequestAction : rejectJoinRequestAction;
      const res = await actionFn(requestId, "通过管理工作台一键审批");
      if (!res.ok) {
        setPendingRequests((prev) => [...prev, targetRequest]);
        feedbackToast.error(action === "approve" ? "审批通过失败" : "驳回申请失败", {
          description: res.error,
        });
      } else {
        feedbackToast.success(action === "approve" ? "已批准入团申请" : "已驳回入团申请");
        router.refresh();
      }
    });
  };

  const handleAssignOrphanMember = (request: OrphanExemptionRequest, teamId: string) => {
    if (!teamId || request.applicant_membership_status === "archived" || request.applicant_membership_status === null) {
      return;
    }

    const previousRequests = orphanExemptionRequests;
    const previousCount = orphanExemptionCount;
    const team = localTeams.find((item) => item.id === teamId);
    setOrphanExemptionRequests((current) => current.filter((item) => item.id !== request.id));
    setOrphanExemptionCount((current) => Math.max(0, current - 1));

    startTransition(async () => {
      const result = await assignOrphanExemptionMember(request.id, request.applicant_user_id, teamId);
      if (result.error) {
        setOrphanExemptionRequests(previousRequests);
        setOrphanExemptionCount(previousCount);
        feedbackToast.error("分配团队失败", { description: result.error });
        return;
      }

      feedbackToast.success(`已将「${request.applicant_name}」分配至${team?.name ?? "目标团队"}，原申请已结束，请让成员重新提交`);
      router.refresh();
    });
  };

  const handleRejectOrphanRequest = (request: OrphanExemptionRequest) => {
    const previousRequests = orphanExemptionRequests;
    const previousCount = orphanExemptionCount;
    setOrphanExemptionRequests((current) => current.filter((item) => item.id !== request.id));
    setOrphanExemptionCount((current) => Math.max(0, current - 1));

    startTransition(async () => {
      const result = await rejectOrphanExemptionRequest(request.id, request.applicant_user_id);
      if (result.error) {
        setOrphanExemptionRequests(previousRequests);
        setOrphanExemptionCount(previousCount);
        feedbackToast.error("拒绝归属异常申请失败", { description: result.error });
        return;
      }

      feedbackToast.success("原申请已拒绝并留痕，请让成员重新提交");
      router.refresh();
    });
  };

  // 10.5 Permanent Exemption Toggle (Owner Only)
  const handleConfirmSetPermanent = async () => {
    if (!setPermanentTarget || isPermanentSubmitting) return;
    const reasonValidation = validatePermanentExemptionReason(permanentReason);
    if (!reasonValidation.ok) {
      setPermanentReasonError(reasonValidation.error);
      return;
    }
    const reasonTrimmed = reasonValidation.data;

    setIsPermanentSubmitting(true);
    setPermanentReasonError(null);

    const targetId = setPermanentTarget.id;
    const res = await requestSetPermanentExemption({
      userId: targetId,
      reason: reasonTrimmed,
    });

    setIsPermanentSubmitting(false);

    if (!res.ok) {
      feedbackToast.error("设置不参与考核失败", { description: res.error });
      return;
    }

    setLocalProfiles((prev) =>
      prev.map((p) =>
        p.id === targetId
          ? {
              ...p,
              status: "exempt",
              exempt_type: "permanent",
              exempt_reason: reasonTrimmed,
              exemption_category: "waive",
            }
          : p
      )
    );
    setSetPermanentTarget(null);
    setPermanentReason("");
    feedbackToast.success("已设置不参与考核");
    router.refresh();
  };

  const handleConfirmClearPermanent = async () => {
    if (!clearPermanentTarget || isPermanentSubmitting) return;

    setIsPermanentSubmitting(true);
    const targetId = clearPermanentTarget.id;

    const res = await requestClearPermanentExemption({
      userId: targetId,
    });

    setIsPermanentSubmitting(false);

    if (!res.ok) {
      feedbackToast.error("撤销不参与考核失败", { description: res.error });
      return;
    }

    const clearData = res.data && typeof res.data === "object" ? res.data as {
      restored_temporary?: boolean;
      temporary_start_date?: string | null;
      temporary_end_date?: string | null;
      temporary_reason?: string | null;
      temporary_category?: string | null;
    } : {};

    setLocalProfiles((prev) =>
      prev.map((p) =>
        p.id === targetId
          ? {
              ...p,
              status: "active",
              exempt_type: clearData.restored_temporary ? "temporary" : null,
              exempt_start_date: clearData.restored_temporary ? (clearData.temporary_start_date ?? null) : null,
              exempt_end_date: clearData.restored_temporary ? (clearData.temporary_end_date ?? null) : null,
              exempt_reason: clearData.restored_temporary ? (clearData.temporary_reason ?? null) : null,
              exemption_category: clearData.restored_temporary ? clearData.temporary_category ?? null : null,
            }
          : p
      )
    );
    setClearPermanentTarget(null);
    feedbackToast.success("已撤销不参与考核");
    router.refresh();
  };

  // 11. AI Suggestions Loader
  const handleFetchAiSuggestion = async () => {
    if (!activeMemberId) return;
    setAiSuggestion({ status: "normal", summary: "", suggestions: [], loading: true, error: null });
    try {
      const res = await fetch("/api/admin/member-ai-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: activeMemberId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAiSuggestion({
          status: "critical",
          summary: "",
          suggestions: [],
          loading: false,
          error: err.error || "获取建议失败",
        });
        return;
      }
      const payload = await res.json();
      setAiSuggestion({
        status: payload.status || "normal",
        summary: payload.summary || "发布与权限状态良好。",
        suggestions: payload.suggestions || [],
        loading: false,
        error: null,
      });
    } catch {
      setAiSuggestion({
        status: "critical",
        summary: "",
        suggestions: [],
        loading: false,
        error: "网络异常，无法获取 AI 诊断",
      });
    }
  };

  // 12. Execute AI Tool Action (Supporting 409 secondary confirmation)
  const handleExecuteAiSuggestion = async (
    suggestion: AiSuggestionItem,
    key: string,
    confirmationToken?: string
  ) => {
    if (executingAiKey && !confirmationToken) return;
    if (suggestion.action.type === "navigate" && suggestion.action.href) {
      router.push(suggestion.action.href);
      return;
    }
    if (suggestion.action.type !== "execute_tool") return;
    const action = suggestion.action;

    setExecutingAiKey(key);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/execute-tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolName: action.toolName,
            toolArgs: action.toolArgs ?? {},
            confirmationToken,
          }),
        });
        if (res.status === 409) {
          const payload = await res.json();
          setToolConfirmationModal({
            toolName: action.toolName,
            toolArgs: action.toolArgs ?? {},
            confirmationToken: payload.confirmationToken,
            preview: payload.result?.preview ?? null,
          });
          return;
        }

        const payload = await res.json();
        if (!res.ok || !payload.success) {
          feedbackToast.error("执行失败", { description: payload.error || "工具执行出错" });
        } else {
          feedbackToast.success("工具执行成功");
          setToolConfirmationModal(null);
          void handleFetchAiSuggestion();
          router.refresh();
        }
      } catch {
        feedbackToast.error("执行超时或网络异常");
      } finally {
        setExecutingAiKey(null);
      }
    });
  };

  const isAllSelected =
    selectableFilteredMemberIds.length > 0 &&
    selectedMemberIds.length === selectableFilteredMemberIds.length;
  const isIndeterminate = selectedMemberIds.length > 0 && !isAllSelected;
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(selectableFilteredMemberIds);
    }
  };

  return (
    <div className="mt-4 w-full space-y-5 relative">
      <div className="space-y-5">
      <MemberAlerts
        pendingRequests={pendingRequests}
        canManageMembers={canManageMembers}
        isPending={isPending}
        handleReviewJoinRequest={handleReviewJoinRequest}
        orphanExemptionCount={orphanExemptionCount}
        isCompanyOwner={isCompanyOwner}
        orphanExemptionRequests={orphanExemptionRequests}
        localTeams={localTeams}
        handleAssignOrphanMember={handleAssignOrphanMember}
        handleRejectOrphanRequest={handleRejectOrphanRequest}
      />
      <MemberToolbar
        selectedTeamId={selectedTeamId}
        setSelectedTeamId={setSelectedTeamId}
        profilesForCurrentView={profilesForCurrentView}
        memberView={memberView}
        localTeams={localTeams}
        canManageTeamStructure={canManageTeamStructure}
        setTeamManagementDialogOpen={setTeamManagementDialogOpen}
        replaceWorkspaceUrl={replaceWorkspaceUrl}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        localProfiles={localProfiles}
        localArchivedProfiles={localArchivedProfiles}
        filteredProfiles={filteredProfiles}
        setMemberView={setMemberView}
        setActiveMemberId={setActiveMemberId}
        setSelectedMemberIds={setSelectedMemberIds}
      />
      <MemberTable
        sortedProfiles={sortedProfiles}
        memberView={memberView}
        canManageMembers={canManageMembers}
        isCompanyOwner={isCompanyOwner}
        currentUserId={currentUserId}
        activeMemberId={activeMemberId}
        restoredFocusId={restoredFocusId}
        selectedMemberIds={selectedMemberIds}
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
        handleToggleSelectAll={handleToggleSelectAll}
        setSelectedMemberIds={setSelectedMemberIds}
        openMemberDrawer={openMemberDrawer}
        canArchiveTarget={canArchiveTarget}
        setRestoreTarget={setRestoreTarget}
        isPending={isPending}
      />      </div>

      {selectedMemberIds.length > 0 && (
        <MemberBatchActions
          selectedMemberIds={selectedMemberIds}
          canManageMembers={canManageMembers}
          localTeams={localTeams}
          handleBatchTransferTeam={handleBatchTransferTeam}
          canManageLifecycle={canManageLifecycle}
          setBatchArchiveReason={(reason) => setBatchArchiveReason(reason)}
          setBatchArchiveOpen={(open) => setBatchArchiveOpen(open)}
          setSelectedMemberIds={(ids) => setSelectedMemberIds(ids)}
        />
      )}
      <MemberInspector
        activeMember={activeMember}
        activeMemberCompanyRole={activeMemberCompanyRole}
        aiSuggestion={aiSuggestion}
        activeMemberIsReadOnly={activeMemberIsReadOnly}
        isCompanyOwner={isCompanyOwner}
        handleFetchAiSuggestion={handleFetchAiSuggestion}
        setIsAiDialogOpen={setIsAiDialogOpen}
        closeMemberDrawer={closeMemberDrawer}
        currentCompanyRole={currentCompanyRole}
        canEditActiveMemberTeam={canEditActiveMemberTeam}
        canEditWorkGroups={canEditWorkGroups}
        canManageCompany={canManageCompany}
        canManageActiveMemberAccount={canManageActiveMemberAccount}
        localTeams={localTeams}
        activeMemberPeerGroup={activeMemberPeerGroup}
        activeMemberOperatorGroup={activeMemberOperatorGroup}
        availablePeerGroups={availablePeerGroups}
        availableOperatorGroups={availableOperatorGroups}
        activeMemberExemptionState={activeMemberExemptionState}
        isPermanentSubmitting={isPermanentSubmitting}
        draftPermissions={draftPermissions}
        handleTransferMemberTeam={handleTransferMemberTeam}
        handleAssignPeerGroup={handleAssignPeerGroup}
        handleAssignOperatorGroup={handleAssignOperatorGroup}
        handleRoleChangeClick={handleRoleChangeClick}
        setClearPermanentTarget={(member) => setClearPermanentTarget(member)}
        setSetPermanentTarget={(member) => setSetPermanentTarget(member)}
        setPermanentReason={(reason) => setPermanentReason(reason)}
        setPermanentReasonError={(error) => setPermanentReasonError(error)}
        setPasswordResetTarget={(member) => setPasswordResetTarget(member)}
        setNewPassword={(password) => setNewPassword(password)}
        setArchiveTarget={(member) => setArchiveTarget(member)}
        setArchiveReason={(reason) => setArchiveReason(reason)}
        canArchiveTarget={canArchiveTarget}
      />
      <ModuleDialogs
        isAiDialogOpen={isAiDialogOpen}
        setIsAiDialogOpen={setIsAiDialogOpen}
        aiSuggestion={aiSuggestion}
        executingAiKey={executingAiKey}
        isPending={isPending}
        toolConfirmationModal={toolConfirmationModal}
        localProfiles={localProfiles}
        localArchivedProfiles={localArchivedProfiles}
        selectedMemberIds={selectedMemberIds}
        handleFetchAiSuggestion={handleFetchAiSuggestion}
        routerPush={(href) => router.push(href)}
        handleExecuteAiSuggestion={handleExecuteAiSuggestion}
        setToolConfirmationModal={setToolConfirmationModal}
        teamManagementDialogOpen={teamManagementDialogOpen}
        setTeamManagementDialogOpen={setTeamManagementDialogOpen}
        canManageTeamStructure={canManageTeamStructure}
        newTeamName={newTeamName}
        setNewTeamName={setNewTeamName}
        handleCreateTeam={handleCreateTeam}
        localTeams={localTeams}
        setDeleteTeamTarget={setDeleteTeamTarget}
        handleDeleteTeam={handleDeleteTeam}
        deleteTeamTarget={deleteTeamTarget}
        archiveTarget={archiveTarget}
        setArchiveTarget={setArchiveTarget}
        archiveReason={archiveReason}
        setArchiveReason={setArchiveReason}
        handleArchiveMember={handleArchiveMember}
        batchArchiveOpen={batchArchiveOpen}
        setBatchArchiveOpen={setBatchArchiveOpen}
        batchArchiveReason={batchArchiveReason}
        setBatchArchiveReason={setBatchArchiveReason}
        handleBatchArchive={handleBatchArchive}
        restoreTarget={restoreTarget}
        setRestoreTarget={setRestoreTarget}
        handleRestoreMember={handleRestoreMember}
        roleChangeConfirm={roleChangeConfirm}
        setRoleChangeConfirm={setRoleChangeConfirm}
        handleRoleChangeConfirm={handleRoleChangeConfirm}
        passwordResetTarget={passwordResetTarget}
        setPasswordResetTarget={setPasswordResetTarget}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        handleResetPassword={handleResetPassword}
        currentCompanyRole={currentCompanyRole}
        setPermanentTarget={setPermanentTarget}
        setSetPermanentTarget={setSetPermanentTarget}
        permanentReason={permanentReason}
        setPermanentReason={setPermanentReason}
        permanentReasonError={permanentReasonError}
        setPermanentReasonError={setPermanentReasonError}
        isPermanentSubmitting={isPermanentSubmitting}
        handleConfirmSetPermanent={handleConfirmSetPermanent}
        clearPermanentTarget={clearPermanentTarget}
        setClearPermanentTarget={setClearPermanentTarget}
        handleConfirmClearPermanent={handleConfirmClearPermanent}
      />
    </div>
  );
}
