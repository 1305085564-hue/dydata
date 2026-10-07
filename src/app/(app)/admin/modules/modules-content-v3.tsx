"use client";

import {
  useState,
  useTransition,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import type { AdminModulesContentProps, ProfileSummary, TeamOption } from "@/lib/modules/types";
import type { OrphanExemptionRequest } from "@/lib/exemption-orphan";
import { resolveProfileCompanyRoleForView } from "@/lib/modules/domain/view-rules";
import { MemberAlerts } from "@/components/modules/member-alerts";
import { MemberBatchActions } from "@/components/modules/member-batch-actions";
import { MemberInspector } from "@/components/modules/member-inspector";
import { MemberTable } from "@/components/modules/member-table";
import { MemberToolbar } from "@/components/modules/member-toolbar";
import { ModuleDialogs } from "@/components/modules/module-dialogs";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getRoleLabel } from "@/lib/role-label";
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

import { useMemberAiActions } from "./member-ai-actions";

import { ALL_TEAMS_ID, getVisibleTeamOptions, resolveSelectedTeamAfterTeamDelete, type TeamViewTeamOption } from "./team-view-logic";
import { resolveAdminModulesAccess } from "./member-access";
import { useMemberWorkspace } from "./member-workspace";

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

  const access = resolveAdminModulesAccess({
    currentUserId,
    currentUserRole,
    currentUserBusinessRole,
    currentUserCompanyRole,
    currentUserGroupMode,
    currentUserPermissions,
    permissionManagerCapabilities,
    teamManagement,
  });
  const {
    currentCompanyRole,
    isGroupMode,
    isOwner,
    isCompanyOwner,
    canManageCompany,
    canManageTeamStructure,
    canManageMembers,
    canEditTeamMembers,
    canManageLifecycle,
    canArchiveTarget,
  } = access;

  const visibleTeamOptions: TeamViewTeamOption[] = useMemo(() => {
    return getVisibleTeamOptions({
      isOwner,
      groupMode: isGroupMode,
      allTeams: initialTeams,
      manageableTeams: teamManagement.teams,
    });
  }, [isGroupMode, isOwner, initialTeams, teamManagement.teams]);

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

  const workspace = useMemberWorkspace({
    currentUserId,
    allProfiles,
    initialArchivedProfiles,
    visibleTeamOptions,
    initialPendingRequests,
    initialOrphanExemptionRequests,
    initialOrphanExemptionCount,
    initialWorkGroups,
    initialWorkGroupRoster,
    focusMemberId,
    initialMemberView,
    initialTeamId,
    initialSearchQuery,
    isOwner,
    isGroupMode,
  });
  const {
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
    localWorkGroupRoster,
    setLocalWorkGroupRoster,
    activeMemberId,
    setActiveMemberId,
    draftPermissions,
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
  } = workspace;

  const aiActions = useMemberAiActions(activeMemberId);
  const {
    isPending: isAiPending,
    isAiDialogOpen,
    setIsAiDialogOpen,
    aiSuggestion,
    executingAiKey,
    toolConfirmationModal,
    setToolConfirmationModal,
    handleFetchAiSuggestion,
    handleExecuteAiSuggestion,
  } = aiActions;

  const activeMemberExemptionState = resolvePermanentExemptionState(activeMember);
  const canEditActiveMemberTeam = Boolean(activeMember) && !activeMemberIsReadOnly &&
    (canManageCompany || (canEditTeamMembers && activeMemberCompanyRole === "member"));
  const canManageActiveMemberAccount = Boolean(activeMember) && !activeMemberIsReadOnly &&
    (canManageCompany || (canManageMembers && activeMemberCompanyRole === "member"));
  const canEditWorkGroups = Boolean(activeMember) && !activeMemberIsReadOnly &&
    (canManageCompany || currentUserPermissions.manage_members === true);

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
        isPending={isPending || isAiPending}
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
