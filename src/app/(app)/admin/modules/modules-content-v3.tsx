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
import {
  UsersRound,
  Users,
  Plus,
  Trash2,
  Sparkles,
  X,
  Search,
  KeyRound,
  Archive,
  RotateCcw,
  ChevronDown,
  Building2,
  UserMinus,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/role-label";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";

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
import type { WorkGroupRow, WorkGroupRosterMember } from "@/lib/work-groups";

import { findFocusMember } from "@/lib/admin/find-focus-member";
import { MemberPermissionEditor } from "../components/member-permission-editor";
import type { OrphanExemptionRequest } from "@/lib/exemption-orphan";

import type {
  CompanyRole,
  DataScope,
  Permissions,
  UserRole,
  UserStatus,
} from "@/types";
import {
  ALL_TEAMS_ID,
  countProfilesInTeamForView,
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
import {
  MemberAiDialogs,
  type AiSuggestionItem,
  type MemberAiSuggestionState,
  type ToolConfirmationState,
} from "./member-ai-dialogs";

/* ─── Types ─── */

export interface ProfileSummary {
  id: string;
  name: string;
  email: string | null;
  last_sign_in_at?: string | null;
  role: UserRole;
  company_role?: CompanyRole | null;
  team_id?: string | null;
  data_scope?: DataScope | null;
  team_name: string | null;
  permissions: Permissions | null;
  status?: string | null;
  membership_status?: "active" | "archived" | string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archived_by_name?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: Record<string, unknown> | null;
  exempt_type?: string | null;
  exempt_start_date?: string | null;
  exempt_end_date?: string | null;
  exempt_reason?: string | null;
  exemption_category?: string | null;
  monthly_published_count?: number;
  monthly_required_count?: number;
  monthly_published_days?: number;
}

export interface TeamOption {
  id: string;
  name: string;
}

export interface PendingRequest {
  id: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string | null;
  targetTeamId: string;
  targetTeamName: string;
  createdAt: string;
}

export interface AdminModulesContentProps {
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
  allProfiles: ProfileSummary[];
  archivedProfiles?: ProfileSummary[];
  teams: TeamOption[];
  teamManagement: {
    access: {
      canView: boolean;
      canEditMembers?: boolean;
      teamIds: string[] | null;
    };
    teams: TeamOption[];
    profiles: unknown[];
  };
  pendingRequests: PendingRequest[];
  orphanExemptionRequests: OrphanExemptionRequest[];
  orphanExemptionCount: number;
  workGroups?: WorkGroupRow[];
  workGroupRoster?: WorkGroupRosterMember[];
  defaultDate: string;
  focusMemberId?: string;
  initialMemberView?: string;
  initialTeamId?: string;
  initialSearchQuery?: string;
}


/* ─── Helpers ─── */

function truncateTeamName(name?: string | null, maxLen = 8): string {
  if (!name) return "未分配";
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen) + "…";
}

function normalizeUserStatus(value: string | null | undefined): UserStatus {
  return value === "exempt" ? "exempt" : "active";
}


function formatDataScope(scope: DataScope | null | undefined): string {
  if (scope === "all") return "全部范围";
  if (scope === "team") return "所属公司";
  return "仅自己";
}

function resolveProfileCompanyRoleForView(profile: Pick<ProfileSummary, "role" | "company_role">) {
  const resolution = resolveProfileCompanyRole(profile.role, profile.company_role);
  if (resolution.conflict) return null;
  if (resolution.companyRole) return resolution.companyRole;
  const hasRoleValue = [profile.role, profile.company_role].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  return hasRoleValue ? null : "member";
}

function runtimeRoleForView(companyRole: CompanyRole | null): UserRole {
  if (companyRole === "company_owner") return "owner";
  return companyRole ?? "member";
}

function archiveSnapshotRoleLabel(snapshot: Record<string, unknown> | null | undefined) {
  const resolution = resolveProfileCompanyRole(snapshot?.role, snapshot?.company_role);
  return resolution.conflict || !resolution.companyRole
    ? "历史记录未保留"
    : getRoleLabel(runtimeRoleForView(resolution.companyRole));
}

function MemberTableHeader({
  showCheckboxSlot,
  isAllSelected,
  isIndeterminate,
  onToggleSelectAll,
}: {
  showCheckboxSlot: boolean;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  onToggleSelectAll: () => void;
}) {
  return (
    <div
      className="hidden md:flex items-center justify-between gap-4 border-b border-[#E2E2DF]/80 text-[12px] font-medium uppercase tracking-wider text-[#78716C] select-none pb-2.5 mb-1 px-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {showCheckboxSlot ? (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isAllSelected}
              indeterminate={isIndeterminate}
              onCheckedChange={onToggleSelectAll}
              aria-label="全选当前可见成员"
              className="size-3.5 rounded border-[#E2E2DF] data-[state=checked]:bg-[#43718E] data-[state=checked]:border-[#43718E]"
              title="全选当前可见成员"
            />
          </div>
        ) : null}
        <span>成员姓名 / 邮箱</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-6 text-right">
        <span className="w-24 sm:w-28 text-left shrink-0">所属团队</span>
        <span className="w-20 sm:w-24 text-center shrink-0">系统角色</span>
        <span className="w-20 sm:w-24 text-left shrink-0 hidden sm:inline">数据范围</span>
        <span className="w-28 text-left shrink-0 hidden lg:inline">上次登录</span>
        <span className="w-10 sm:w-12 text-right shrink-0">操作</span>
      </div>
    </div>
  );
}

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
      try {
        const response = await fetch("/api/admin/modules/member-emails", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.emails && active) {
          setLocalProfiles((prev) =>
            prev.map((p) => ({ ...p, email: payload.emails[p.id] ?? p.email }))
          );
        }
      } catch {}
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
      if (!assignRes.ok) {
        setLocalWorkGroupRoster(previousRoster);
        feedbackToast.error("分配小队失败", { description: assignRes.message });
      } else {
        feedbackToast.success(
          describeAssignSuccess({
            groupName: targetGroup?.name ?? "小队",
            replacedGroupName: assignRes.value.replacedGroupName,
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
      if (!assignRes.ok) {
        setLocalWorkGroupRoster(previousRoster);
        feedbackToast.error("分配运营小队失败", { description: assignRes.message });
      } else {
        feedbackToast.success(
          describeAssignSuccess({
            groupName: targetGroup?.name ?? "小队",
            replacedGroupName: assignRes.value.replacedGroupName,
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
        {/* ── 待审批入团申请预警栏（复用标准 Alert 规范） ── */}
        {pendingRequests.length > 0 && (
          <Alert className="rounded-lg border-[#E2E2DF] bg-[#FCFCFB] p-4 text-[13px] text-[#78716C]">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#B98A54]/10 text-[#B98A54]">
                <span className="size-1.5 rounded-full bg-[#B98A54]" />
              </span>
              <AlertTitle className="text-[14px] leading-[1.40] font-medium text-[#1C1917] mb-0">待审批入团申请</AlertTitle>
              <span className="rounded-md bg-[#B98A54]/15 px-2 py-0.5 text-[12px] font-medium text-[#B98A54] tabular-nums">
                {pendingRequests.length} 位新成员
              </span>
            </div>
            <AlertDescription className="divide-y divide-[#E2E2DF]">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-[#1C1917]">{req.applicantName}</span>
                    <span className="mx-2 text-[#E2E2DF]">·</span>
                    <span className="text-[12px] text-[#292524]">申请加入：{req.targetTeamName}</span>
                    <span className="mx-2 text-[#E2E2DF]">·</span>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      {new Date(req.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  {canManageMembers && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="s"
                        onClick={() => handleReviewJoinRequest(req.id, "reject")}
                        disabled={isPending}
                        className="text-[#78716C] hover:bg-[#C0685C]/10 hover:text-[#C0685C]"
                      >
                        拒绝
                      </Button>
                      <Button
                        size="s"
                        onClick={() => handleReviewJoinRequest(req.id, "approve")}
                        disabled={isPending}
                      >
                        同意入团
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {orphanExemptionCount > 0 && (
          <Alert className="rounded-lg border-[#E2E2DF] bg-[#FCFCFB] p-4 text-[13px] text-[#78716C]">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#C0685C]/10 text-[#C0685C]">
                <span className="size-1.5 rounded-full bg-[#C0685C]" />
              </span>
              <AlertTitle className="text-[14px] leading-[1.40] font-medium text-[#1C1917] mb-0">待归属申请</AlertTitle>
              <span className="rounded-md bg-[#C0685C]/15 px-2 py-0.5 text-[12px] font-medium text-[#C0685C] tabular-nums">
                {orphanExemptionCount} 条
              </span>
            </div>

            {isCompanyOwner ? (
              <AlertDescription className="divide-y divide-[#E2E2DF]">
                {orphanExemptionRequests.map((request) => {
                  const isArchivedOrDeleted =
                    request.applicant_membership_status === "archived" ||
                    request.applicant_membership_status === null;

                  return (
                    <div key={request.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[13px] font-medium text-[#1C1917]">
                            {request.applicant_name}
                          </span>
                          <span className="text-[12px] text-[#C0685C]">
                            {isArchivedOrDeleted
                              ? request.applicant_membership_status === "archived" ? "已归档" : "已注销或资料缺失"
                              : "当前未分配团队"}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] leading-[1.7] text-[#78716C]">
                          快照团队：{request.snapshot_team_name ?? "未记录"} · {request.exemption_category ?? "waive"} / {request.exemption_type} · {request.start_date}
                          {request.end_date ? ` 至 ${request.end_date}` : ""} · 提交于 {new Date(request.created_at).toLocaleDateString("zh-CN")}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {!isArchivedOrDeleted && (
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (event.target.value) {
                                handleAssignOrphanMember(request, event.target.value);
                                event.target.value = "";
                              }
                            }}
                            disabled={isPending}
                            className="h-7 rounded-md border border-[#E2E2DF] bg-white px-2 text-[12px] text-[#292524] shadow-input outline-none"
                            aria-label={`为${request.applicant_name}分配团队`}
                          >
                            <option value="" disabled>分配至团队…</option>
                            {localTeams.map((team) => (
                              <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                          </select>
                        )}
                        <Button
                          variant="ghost"
                          size="s"
                          onClick={() => handleRejectOrphanRequest(request)}
                          disabled={isPending}
                          className="text-[#78716C] hover:bg-[#C0685C]/10 hover:text-[#C0685C]"
                        >
                          拒绝并留痕
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </AlertDescription>
            ) : (
              <AlertDescription className="text-[13px] leading-[1.7] text-[#78716C]">
                有待公司所有者处理的归属异常
              </AlertDescription>
            )}
          </Alert>
        )}

        {/* ── 主控制台与高密度成员列表（标准 1 层 L1 白底微岛屿） ── */}
        <section className="bg-white rounded-2xl shadow-card-ring p-5">
          {/* 工具栏：平铺去框，呼吸线分隔，与下方列表以 1px 细线自然区分 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3.5 mb-3.5 border-b border-[#E2E2DF]">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* 团队选择器 */}
              <Select
                value={selectedTeamId}
                onValueChange={(val) => {
                  if (!val) return;
                  if (val === "__manage__") {
                    setTeamManagementDialogOpen(true);
                  } else {
                    setSelectedTeamId(val);
                    replaceWorkspaceUrl({ team: val });
                  }
                }}
              >
                <SelectTrigger className="h-7 border-0 bg-transparent px-2.5 text-[13px] font-medium text-[#292524] hover:bg-[#EBEBE9] rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 data-popup-open:bg-[#F1F1F0]">
                  <SelectValue>
                    {selectedTeamId === ALL_TEAMS_ID
                      ? `全员 (${profilesForCurrentView.length})`
                      : (() => {
                          const currentTeam = localTeams.find((t) => t.id === selectedTeamId);
                          if (!currentTeam) return "全员";
                          const count = countProfilesInTeamForView(profilesForCurrentView, memberView, currentTeam.id);
                          return `${truncateTeamName(currentTeam.name, 10)} (${count})`;
                        })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] shadow-claude-float min-w-44 py-1">
                  <SelectItem value={ALL_TEAMS_ID}>
                    全员 ({profilesForCurrentView.length})
                  </SelectItem>
                  {localTeams.map((t) => {
                    const count = countProfilesInTeamForView(profilesForCurrentView, memberView, t.id);
                    return (
                      <SelectItem key={t.id} value={t.id}>
                        {truncateTeamName(t.name, 10)} ({count})
                      </SelectItem>
                    );
                  })}
                  {canManageTeamStructure && <SelectSeparator />}
                  {canManageTeamStructure && (
                    <SelectItem value="__manage__" className="text-[#78716C] hover:text-[#1C1917]">
                      管理架构…
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>

              {/* 16px 呼吸竖线 */}
              <span className="text-[#E2E2DF] mx-1 select-none" aria-hidden="true">|</span>

              {/* 搜索框：微胶囊 */}
              <div className="relative">
                <Search className="absolute left-3 top-2 size-3.5 text-[#78716C]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const nextQuery = e.target.value;
                    setSearchQuery(nextQuery);
                    replaceWorkspaceUrl({ query: nextQuery });
                  }}
                  placeholder="搜索成员姓名或邮箱…"
                  className="h-7 pl-8 pr-4 text-[13px] bg-[#FCFCFB]/50 border border-[#E2E2DF] shadow-input hover:border-[#78716C]/40 rounded-full w-48 sm:w-56 focus-visible:w-64 focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 outline-none transition-all placeholder:text-[#78716C]/60"
                />
              </div>

              {canManageTeamStructure && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTeamManagementDialogOpen(true)}
                  className="h-7 px-2 text-[#78716C] hover:text-[#292524] rounded-md ml-1"
                  title="团队架构设置"
                >
                  <Settings className="size-3.5" />
                </Button>
              )}
            </div>

            {/* 状态切换与计数 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-[13px]" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={memberView === "active"}
                  onClick={() => {
                    setMemberView("active");
                    replaceWorkspaceUrl({ view: "active", memberId: null });
                  }}
                  className={cn(
                    "transition-colors",
                    memberView === "active"
                      ? "text-[#1C1917] font-medium"
                      : "text-[#78716C] hover:text-[#292524]"
                  )}
                >
                  在职 {localProfiles.length}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={memberView === "archived"}
                  onClick={() => {
                    setMemberView("archived");
                    setActiveMemberId(null);
                    setSelectedMemberIds([]);
                    replaceWorkspaceUrl({ view: "archived", memberId: null });
                  }}
                  className={cn(
                    "transition-colors",
                    memberView === "archived"
                      ? "text-[#1C1917] font-medium"
                      : "text-[#78716C] hover:text-[#292524]"
                  )}
                >
                  归档 {localArchivedProfiles.length}
                </button>
              </div>

              <span className="text-[12px] text-[#78716C] tabular-nums">
                {filteredProfiles.length}/{profilesForCurrentView.length}
              </span>
              {memberView === "archived" && searchQuery.trim() ? (
                <span className="flex items-center gap-1.5 text-[12px] text-[#78716C]">
                  搜索仍生效
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      replaceWorkspaceUrl({ query: "" });
                    }}
                    className="font-medium text-[#292524] hover:underline"
                  >
                    清除搜索
                  </button>
                </span>
              ) : null}
            </div>
          </div>

          {/* 成员双列平铺列表 */}
          {sortedProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UsersRound className="size-8 text-[#E2E2DF] mb-3" />
              <p className="text-[13px] text-[#78716C]">没有找到成员</p>
              <p className="text-[12px] text-[#78716C] mt-1">调整筛选或搜索条件试试</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              <MemberTableHeader
                showCheckboxSlot={canManageMembers && memberView !== "archived"}
                isAllSelected={isAllSelected}
                isIndeterminate={isIndeterminate}
                onToggleSelectAll={handleToggleSelectAll}
              />
              <div className="divide-y divide-[#E2E2DF]/50">
                {sortedProfiles.map((member) => {
                  const isArchivedView = memberView === "archived";
                  const isCurrentMemberActive = activeMemberId === member.id;
                  const isRestoredFocus = restoredFocusId === member.id;
                  const isChecked = selectedMemberIds.includes(member.id);
                  const memberCompanyRole = resolveProfileCompanyRoleForView(member);
                  const memberRuntimeRole = runtimeRoleForView(memberCompanyRole);

                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-3 py-2.5 min-h-[46px] transition-colors duration-150 select-none",
                        isRestoredFocus
                          ? "bg-[#F1F1F0] transition-colors duration-500"
                          : isChecked
                          ? "bg-[#FCFCFB]"
                          : isCurrentMemberActive
                          ? "bg-[#FCFCFB]"
                          : "bg-transparent hover:bg-[#F7F7F6]"
                      )}
                    >
                      {canManageMembers && !isArchivedView ? (
                        !isMemberTargetReadOnly(member, currentUserId) ? (
                          <Checkbox
                            aria-label={`选择「${member.name}」`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedMemberIds((prev) => Array.from(new Set([...prev, member.id])));
                              else setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
                            }}
                            className={cn(
                              "size-3.5 shrink-0 rounded border-[#E2E2DF] transition-opacity data-[state=checked]:bg-[#43718E] data-[state=checked]:border-[#43718E]",
                              isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                            )}
                          />
                        ) : <span className="size-3.5 shrink-0" />
                      ) : null}

                      <button
                        type="button"
                        onClick={() => openMemberDrawer(member)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/40 rounded-md"
                        aria-label={`打开「${member.name}」${isArchivedView ? "归档档案" : "成员详情"}`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                          <span className="size-7 rounded-full bg-[#F1F1F0] text-[#292524] flex items-center justify-center font-medium text-[12px] shrink-0 border border-[#E2E2DF]/60">
                            {member.name ? member.name.slice(0, 1) : "U"}
                          </span>
                          <span className="flex min-w-0 flex-col justify-center">
                            <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                              <span className="truncate text-[14px] font-medium text-[#1C1917]">{member.name}</span>
                              {member.id === currentUserId && <span className="shrink-0 rounded bg-[#F1F1F0] px-1.5 py-0.2 text-[12px] font-medium text-[#78716C]">我</span>}
                              {isArchivedView && <span className="shrink-0 rounded bg-[#F1F1F0] px-1.5 py-0.2 text-[12px] text-[#78716C]">已归档</span>}
                            </span>
                            {member.email && <span className="mt-0.5 truncate text-[12px] leading-tight text-[#78716C]">{member.email}</span>}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-2 sm:gap-6">
                        {/* 所属团队 */}
                        <span className="w-20 sm:w-28 text-left shrink-0">
                          <span className="text-[13px] text-[#292524] truncate block" title={member.team_name || "未分配团队"}>
                            {member.team_name || <span className="text-[#A8A29E]">未分配</span>}
                          </span>
                        </span>

                        {/* 角色 */}
                        <span className="w-18 sm:w-24 text-center shrink-0">
                          <span className={cn(
                            "text-[12px] px-1.5 sm:px-2 py-0.5 rounded font-medium inline-block",
                            memberCompanyRole === "company_owner"
                              ? "bg-[#D97757]/10 text-[#D97757]"
                              : memberCompanyRole === "admin"
                              ? "bg-[#43718E]/10 text-[#43718E]"
                              : "bg-[#F1F1F0] text-[#78716C]"
                          )}>
                            {getRoleLabel(memberRuntimeRole, { membershipStatus: member.membership_status })}
                          </span>
                        </span>

                        {/* 数据范围：小屏下沉入抽屉，sm+ 显示 */}
                        <span className="w-20 sm:w-24 text-left shrink-0 hidden sm:block">
                          <span className="text-[12px] sm:text-[13px] text-[#78716C]">
                            {formatDataScope(
                              (member.archive_snapshot?.data_scope as DataScope | undefined) ?? member.data_scope,
                            )}
                          </span>
                        </span>

                        {/* 上次登录：lg+ 显示 */}
                        <span className="w-28 text-left shrink-0 hidden lg:block">
                          <span className="text-[12px] text-[#78716C] tabular-nums">
                            {member.last_sign_in_at ? member.last_sign_in_at.slice(0, 10) : "—"}
                          </span>
                        </span>
                        {!isArchivedView && <span className="w-10 sm:w-12 shrink-0 text-right text-[12px] font-medium text-[#D97757] opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">管理</span>}
                        </span>
                      </button>
                      {isArchivedView && canArchiveTarget(member) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRestoreTarget(member)}
                          disabled={isPending}
                          className="h-7 px-2 text-[12px] text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9]"
                          title="恢复账号"
                        >
                          <RotateCcw className="size-3 mr-1" />恢复
                        </Button>
                      ) : isArchivedView ? <span className="w-10 sm:w-12 shrink-0" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── 3.1 底部批量操作浮动条 (跟随 v3 风格) ── */}
      {selectedMemberIds.length > 0 && (
        <aside
          aria-label="批量操作"
          className="fixed bottom-[calc(var(--app-bottom-nav-height,0px)+1rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-wrap max-w-[calc(100vw-2rem)] items-center justify-center gap-2 sm:gap-3 rounded-xl border border-[#E2E2DF]/80 bg-[#FCFCFB]/90 backdrop-blur-md px-3.5 sm:px-5 py-2 sm:py-2.5 shadow-claude-float transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
        >
          <span className="text-[12px] font-medium text-[#1C1917] pr-3 border-r border-[#E2E2DF]">
            已选 {selectedMemberIds.length} 位成员
          </span>

          {canManageMembers && (
            <div className="relative">
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleBatchTransferTeam(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="h-7 text-[12px] font-medium bg-[#F1F1F0]/70 shadow-input border border-[#E2E2DF] rounded-full px-2.5 pr-6 text-[#292524] outline-none appearance-none cursor-pointer hover:bg-[#EBEBE9] transition-colors"
              >
                <option value="" disabled>
                  调配至团队…
                </option>
                {localTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2 size-3 text-[#78716C]" />
            </div>
          )}

          {canManageLifecycle && (
            <Button
              variant="ghost"
              size="s"
              onClick={() => {
                setBatchArchiveReason("");
                setBatchArchiveOpen(true);
              }}
              className="h-7 px-3 text-[12px] text-[#C0685C] hover:bg-[#C0685C]/10 hover:text-[#C0685C] rounded-md font-medium active:scale-[0.99] active:duration-120"
            >
              <Archive className="size-3 mr-1" />
              批量归档
            </Button>
          )}

          <button
            type="button"
            onClick={() => setSelectedMemberIds([])}
            className="rounded-lg p-1 text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#292524] transition-colors"
            title="取消选择"
          >
            <X className="size-3.5" />
          </button>
        </aside>
      )}

      {/* ── 2. 全功能右侧工作台抽屉 (整合 v4 Inspector Sheet) ── */}
      <Sheet
        open={activeMember !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeMemberDrawer();
          }
        }}
      >
        <SheetContent showCloseButton={false} className="w-full max-w-xl sm:max-w-xl p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog">
          {activeMember && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* 抽屉头部 */}
              <div className="px-6 pt-5 pb-4 border-b border-[#E2E2DF] flex items-start justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-full bg-[#F1F1F0] text-[#292524] flex items-center justify-center font-medium text-sm shrink-0">
                    {activeMember.name ? activeMember.name.slice(0, 1) : "U"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="text-lg leading-[1.30] font-medium text-[#1C1917] truncate">
                        {activeMember.membership_status === "archived" ? "归档档案 · " : ""}{activeMember.name || "未命名"}
                      </SheetTitle>
                      <span className="text-[12px] px-1.5 py-0.5 rounded-md font-medium bg-[#F1F1F0] text-[#292524] shrink-0">
                        {getRoleLabel(runtimeRoleForView(activeMemberCompanyRole), { membershipStatus: activeMember.membership_status })}
                      </span>
                      {activeMember.membership_status === "archived" && (
                        <span className="text-[12px] px-1.5 py-0.5 rounded-md font-medium bg-[#F1F1F0] text-[#78716C] shrink-0">
                          已归档
                        </span>
                      )}
                    </div>
                    <SheetDescription className="text-[13px] text-[#292524] mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {activeMember.team_name && <span>{activeMember.team_name}</span>}
                      {activeMember.email && (
                        <>
                          {activeMember.team_name && <span className="text-[#E2E2DF]">·</span>}
                          <span className="truncate">{activeMember.email}</span>
                        </>
                      )}
                      {activeMember.last_sign_in_at && (
                        <>
                          <span className="text-[#E2E2DF]">|</span>
                          <span className="text-[12px] text-[#78716C]">
                            上次登录：{activeMember.last_sign_in_at.slice(0, 16).replace("T", " ")}
                          </span>
                        </>
                      )}
                    </SheetDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeMember.membership_status !== "archived" && !activeMemberIsReadOnly && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setIsAiDialogOpen(true);
                        if (!aiSuggestion) handleFetchAiSuggestion();
                      }}
                      className="h-7 px-2.5 text-[13px] font-medium text-[#292524] hover:text-[#D97757] hover:border-[#D97757]/40 gap-1 rounded-md"
                    >
                      <Sparkles className="size-3.5 text-[#D97757]" />
                      AI 诊断
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label="关闭成员权限详情"
                    onClick={() => {
                      closeMemberDrawer();
                    }}
                    className="p-1.5 text-[#78716C] hover:text-[#292524] hover:bg-[#EBEBE9] rounded-lg transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* 抽屉内容主体（单页直通） */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-6 space-y-8">
                {activeMember.membership_status === "archived" && (
                  <section className="space-y-3" aria-labelledby="archive-record-title">
                    <h4 id="archive-record-title" className="text-[14px] leading-[1.40] font-medium text-[#1C1917]">归档记录</h4>
                    <dl className="space-y-2 border-t border-[#E2E2DF]/60 pt-3 text-[13px]">
                      {[
                        ["归档时间", activeMember.archived_at ? new Date(activeMember.archived_at).toLocaleString("zh-CN", { hour12: false }) : "历史记录未保留"],
                        ["操作人", activeMember.archived_by_name || "历史记录未保留"],
                        ["原因", activeMember.archive_reason || "历史记录未保留"],
                        ["归档前团队", typeof activeMember.archive_snapshot?.team_name === "string" ? activeMember.archive_snapshot.team_name : "历史记录未保留"],
                        ["归档前角色", archiveSnapshotRoleLabel(activeMember.archive_snapshot)],
                        ["归档前数据范围", typeof activeMember.archive_snapshot?.data_scope === "string" ? formatDataScope(activeMember.archive_snapshot.data_scope as DataScope) : "历史记录未保留"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-start justify-between gap-4">
                          <dt className="shrink-0 text-[#78716C]">{label}</dt>
                          <dd className="text-right text-[#292524]">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="border-t border-[#E2E2DF]/60 pt-3 text-[13px] leading-relaxed text-[#78716C]">
                      恢复后成为在职未分组成员，原团队不自动恢复。
                    </p>
                  </section>
                )}

                {/* 1. 高频账户与团队管理 */}
                {activeMember.membership_status !== "archived" && (
                  <div className="space-y-3">
                    <h4 className="text-[14px] leading-[1.40] font-medium text-[#1C1917] mb-2">账户与团队管理</h4>
                    <div className="space-y-0.5">
                      {/* 所属团队 */}
                      <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#F7F7F6] transition-colors">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-3.5 text-[#78716C] shrink-0" />
                          <span className="text-[13px] text-[#292524]">所属团队</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {canEditActiveMemberTeam ? (
                            <Select
                              value={activeMember.team_id || "__unassigned__"}
                              onValueChange={(val) => {
                                if (val) {
                                  const newId = val === "__unassigned__" ? null : val;
                                  handleTransferMemberTeam(activeMember.id, newId);
                                }
                              }}
                            >
                              <SelectTrigger className="h-7 text-[13px] border-transparent bg-transparent hover:bg-[#EBEBE9] min-w-[110px] text-right font-normal">
                                <SelectValue placeholder="未分配团队">
                                  {activeMember.team_name || (activeMember.team_id ? localTeams.find(t => t.id === activeMember.team_id)?.name : "未分配团队")}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned__">未分配团队</SelectItem>
                                {localTeams.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[13px] text-[#78716C]">
                              {activeMember.team_name || "未分配团队"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 工种小队 (文案/达人 二选一) */}
                      <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#F7F7F6] transition-colors">
                        <div className="flex items-center gap-2">
                          <Users className="size-3.5 text-[#78716C] shrink-0" />
                          <span className="text-[13px] text-[#292524]">工种小队</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {canEditWorkGroups && activeMember.team_id ? (
                            <Select
                              value={activeMemberPeerGroup?.id || "__none__"}
                              onValueChange={(val) => {
                                if (val) handleAssignPeerGroup(val);
                              }}
                            >
                              <SelectTrigger className="h-7 text-[13px] border-transparent bg-transparent hover:bg-[#EBEBE9] min-w-[110px] text-right font-normal">
                                <SelectValue placeholder="未分配小队">
                                  {activeMemberPeerGroup
                                    ? `${activeMemberPeerGroup.name} (${activeMemberPeerGroup.kind === "writer" ? "文案" : "达人"})`
                                    : "未分配小队"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">未分配小队</SelectItem>
                                {availablePeerGroups.map((g) => (
                                  <SelectItem key={g.id} value={g.id}>
                                    {g.name} ({g.kind === "writer" ? "文案" : "达人"})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[13px] text-[#78716C]">
                              {!activeMember.team_id
                                ? "需先分配团队"
                                : activeMemberPeerGroup
                                ? `${activeMemberPeerGroup.name} (${activeMemberPeerGroup.kind === "writer" ? "文案" : "达人"})`
                                : "未分配小队"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 运营小队 (可兼任) */}
                      <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#F7F7F6] transition-colors">
                        <div className="flex items-center gap-2">
                          <Users className="size-3.5 text-[#78716C] shrink-0" />
                          <span className="text-[13px] text-[#292524]">运营小队</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {canEditWorkGroups && activeMember.team_id ? (
                            <Select
                              value={activeMemberOperatorGroup?.id || "__none__"}
                              onValueChange={(val) => {
                                if (val) handleAssignOperatorGroup(val);
                              }}
                            >
                              <SelectTrigger className="h-7 text-[13px] border-transparent bg-transparent hover:bg-[#EBEBE9] min-w-[110px] text-right font-normal">
                                <SelectValue placeholder="未分配小队">
                                  {activeMemberOperatorGroup?.name || "未分配小队"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">未分配小队</SelectItem>
                                {availableOperatorGroups.map((g) => (
                                  <SelectItem key={g.id} value={g.id}>
                                    {g.name} (运营)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[13px] text-[#78716C]">
                              {!activeMember.team_id
                                ? "需先分配团队"
                                : activeMemberOperatorGroup?.name || "未分配小队"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 系统角色切换 */}
                      {!activeMemberIsReadOnly && (
                        canManageCompany ? (
                          <button
                            type="button"
                            onClick={() => handleRoleChangeClick(activeMember)}
                            className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg text-left hover:bg-[#EBEBE9] active:scale-[0.99] transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-2">
                              <Settings className="size-3.5 text-[#78716C] group-hover:text-[#292524] shrink-0 transition-colors" />
                              <span className="text-[13px] text-[#292524]">
                                {activeMemberCompanyRole === "admin" ? "降为组员" : "提升为组长 · 管理"}
                              </span>
                            </div>
                            <span className="text-[13px] text-[#78716C] group-hover:text-[#1C1917] transition-colors">
                              切换身份
                            </span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between py-1.5 px-2 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Settings className="size-3.5 text-[#78716C] shrink-0" />
                              <span className="text-[13px] text-[#292524]">
                                {activeMemberCompanyRole === "admin" ? "组长 · 管理" : "组员"}
                              </span>
                            </div>
                            <span className="text-[13px] text-[#78716C]">
                              {getRoleLabel(runtimeRoleForView(activeMemberCompanyRole), { membershipStatus: activeMember.membership_status })}
                            </span>
                          </div>
                        )
                      )}

                      {/* 重置密码 */}
                      {canManageActiveMemberAccount && (
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordResetTarget(activeMember);
                            setNewPassword("");
                          }}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg text-left hover:bg-[#EBEBE9] active:scale-[0.99] transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <KeyRound className="size-3.5 text-[#78716C] group-hover:text-[#292524] shrink-0 transition-colors" />
                            <span className="text-[13px] text-[#292524]">重置账户密码</span>
                          </div>
                          <span className="text-[13px] text-[#78716C] group-hover:text-[#1C1917] transition-colors">
                            快捷重置
                          </span>
                        </button>
                      )}

                      {/* 移出团队 */}
                      {canEditActiveMemberTeam && activeMember.team_id && (
                        <button
                          type="button"
                          onClick={() => handleTransferMemberTeam(activeMember.id, null)}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg text-left hover:bg-[#EBEBE9] active:scale-[0.99] transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <UserMinus className="size-3.5 text-[#78716C] group-hover:text-[#292524] shrink-0 transition-colors" />
                            <span className="text-[13px] text-[#292524]">移出团队</span>
                          </div>
                          <span className="text-[13px] text-[#78716C] group-hover:text-[#C0685C] transition-colors">
                            保留账号
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. 数据范围与功能权限只读说明 */}
                <MemberPermissionEditor
                  member={{
                    id: activeMember.id,
                    name: activeMember.name ?? "",
                    email: activeMember.email,
                    last_sign_in_at: activeMember.last_sign_in_at,
                    role: activeMember.role,
                    company_role: activeMember.company_role ?? null,
                    teamId: activeMember.team_id,
                    teamName: activeMember.team_name,
                    permissions: activeMember.permissions ?? {},
                    data_scope: activeMember.data_scope,
                    status: normalizeUserStatus(activeMember.status),
                  }}
                  draftPermissions={draftPermissions}
                />

                {/* 3. 危险操作区 */}
                {activeMember.membership_status !== "archived" && canArchiveTarget(activeMember) && (
                  <div className="pt-6 border-t border-[#E2E2DF] space-y-3">
                    <h4 className="text-[14px] leading-[1.40] font-medium text-[#C0685C] mb-2">危险操作</h4>
                    <button
                      type="button"
                      onClick={() => {
                        setArchiveTarget(activeMember);
                        setArchiveReason("");
                      }}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg text-left hover:bg-[#C0685C]/10 active:scale-[0.99] transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <Trash2 className="size-3.5 text-[#C0685C] shrink-0" />
                        <span className="text-[13px] text-[#C0685C] font-medium">归档账号</span>
                      </div>
                      <span className="text-[13px] text-[#C0685C] font-medium group-hover:text-[#C0685C]/80 transition-colors">
                        封禁登录并移出团队
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Dialogs ── */}

      <MemberAiDialogs
        open={isAiDialogOpen}
        onOpenChange={setIsAiDialogOpen}
        suggestion={aiSuggestion}
        executingKey={executingAiKey}
        pending={isPending}
        confirmation={toolConfirmationModal}
        profiles={[...localProfiles, ...localArchivedProfiles]}
        onRefresh={() => void handleFetchAiSuggestion()}
        onNavigate={(href) => router.push(href)}
        onExecute={(suggestion, key) => void handleExecuteAiSuggestion(suggestion, key)}
        onCancelConfirmation={() => setToolConfirmationModal(null)}
        onConfirm={() => {
          if (!toolConfirmationModal) return;
          const fakeSuggestion: AiSuggestionItem = {
            label: "确认执行",
            description: "",
            action: {
              type: "execute_tool",
              toolName: toolConfirmationModal.toolName,
              toolArgs: toolConfirmationModal.toolArgs,
            },
          };
          void handleExecuteAiSuggestion(fakeSuggestion, "confirmed", toolConfirmationModal.confirmationToken);
        }}
      />

      {/* 3.4 团队架构管理弹窗 (支持删除空团队与新建) */}
      <Dialog open={teamManagementDialogOpen} onOpenChange={setTeamManagementDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden max-w-[460px] p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg leading-[1.30] font-medium text-[#1C1917]">团队架构管理</DialogTitle>
            <DialogDescription className="text-[13px] text-[#292524]">
              新建团队或维护现有团队架构
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
            {canManageTeamStructure && (
              <div className="space-y-1.5">
                <Label htmlFor="v3-team-name" className="text-[13px] font-medium text-[#292524]">
                  新建团队
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="v3-team-name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="例如：深圳一部、杭州运营组"
                    className="h-7 text-[12px] rounded-md"
                  />
                  <Button
                    onClick={handleCreateTeam}
                    disabled={isPending || !newTeamName.trim()}
                    className="h-7 px-3 border border-[#E2E2DF] bg-[#F1F1F0] text-[#292524] hover:bg-[#EBEBE9] hover:text-[#1C1917] rounded-md text-[12px] shrink-0 active:scale-[0.99] active:duration-120"
                  >
                    <Plus className="size-3.5 mr-1" />
                    创建
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[260px] overflow-y-auto pt-2">
              <span className="text-[13px] font-medium text-[#78716C] uppercase tracking-wider">
                现有团队 ({localTeams.length})
              </span>
              {localTeams.length === 0 ? (
                <p className="text-[13px] text-[#78716C] py-3 text-center">还没有团队记录</p>
              ) : (
                localTeams.map((team) => {
                  const count = localProfiles.filter((p) => p.team_id === team.id).length;
                  return (
                    <div
                      key={team.id}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[#E2E2DF]/70 bg-[#FCFCFB]/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="size-3.5 text-[#78716C] shrink-0" />
                        <span className="text-[13px] font-medium text-[#292524] truncate">{team.name}</span>
                        <span className="text-[12px] text-[#78716C] bg-white px-2 py-0.5 rounded-full border border-[#E2E2DF]/50 tabular-nums">
                          {count} 人
                        </span>
                      </div>
                      {canManageTeamStructure && count === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTeamTarget(team)}
                          className="h-7 px-2 text-[12px] text-[#78716C] hover:text-[#C0685C] rounded-lg shrink-0"
                          title="删除空团队"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              variant="outline"
              size="s"
              onClick={() => setTeamManagementDialogOpen(false)}
              className="h-7 text-[12px] rounded-md"
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除空团队确认 */}
      <ConfirmDialog
        open={deleteTeamTarget !== null}
        title="删除团队"
        description={deleteTeamTarget ? `确定删除「${deleteTeamTarget.name}」？此操作不可撤销。` : ""}
        confirmText="确认删除"
        destructive
        loading={isPending}
        onConfirm={() => {
          if (deleteTeamTarget) handleDeleteTeam(deleteTeamTarget);
        }}
        onOpenChange={(o) => {
          if (!o) setDeleteTeamTarget(null);
        }}
      />

      {/* 单账号归档弹窗 (带原因输入) */}
      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
            setArchiveReason("");
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium text-[#1C1917]">确认归档成员账号</DialogTitle>
            <DialogDescription>
              即将归档「{archiveTarget?.name}」的账号。归档将立即封禁登录并移出团队，历史日报不受影响。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-1.5">
            <label className="text-[13px] font-medium text-[#292524] block">
              归档原因说明 <span className="text-[#C0685C]">*</span>
            </label>
            <Input
              placeholder="必填，例如：离职、转岗、实习结束"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setArchiveTarget(null);
                setArchiveReason("");
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || !archiveReason.trim()}
              onClick={handleArchiveMember}
            >
              {isPending ? "处理中..." : "确认归档"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量归档弹窗 */}
      <Dialog
        open={batchArchiveOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBatchArchiveOpen(false);
            setBatchArchiveReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium text-[#1C1917]">批量归档成员账号</DialogTitle>
            <DialogDescription>
              即将批量归档选中的 {selectedMemberIds.length} 位成员账号，归档后将封禁登录并移出各自团队。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-1.5">
            <label className="text-[13px] font-medium text-[#292524] block">
              统一归档原因说明 <span className="text-[#C0685C]">*</span>
            </label>
            <Input
              placeholder="必填，例如：业务调整批量归档、实习期满离职"
              value={batchArchiveReason}
              onChange={(e) => setBatchArchiveReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBatchArchiveOpen(false);
                setBatchArchiveReason("");
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || !batchArchiveReason.trim()}
              onClick={handleBatchArchive}
            >
              {isPending ? "批量处理中..." : `确认归档 (${selectedMemberIds.length}人)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 恢复账号确认 */}
      <ConfirmDialog
        open={restoreTarget !== null}
        title="恢复成员账号"
        description={
          restoreTarget ? `确认恢复 ${restoreTarget.name}？恢复后将解除封禁，成为未分配团队的在职组员。` : ""
        }
        confirmText="确认恢复"
        loading={isPending}
        onConfirm={handleRestoreMember}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      />

      {/* 角色切换确认 */}
      <ConfirmDialog
        open={roleChangeConfirm !== null}
        title={roleChangeConfirm?.targetRole === "admin" ? "提升为组长（管理层）" : "调整为组员"}
        description={
          roleChangeConfirm
            ? roleChangeConfirm.targetRole === "admin"
              ? `即将提升「${roleChangeConfirm.memberName}」为组长。提升后该成员将获得管理层职级，可管理本公司全部成员。确认继续？`
              : `即将调整「${roleChangeConfirm.memberName}」为组员。调整后该成员将失去管理权限，且当前的功能权限配置将被清空。确认继续？`
            : ""
        }
        confirmText="确认变更"
        destructive={roleChangeConfirm?.targetRole === "member"}
        loading={isPending}
        onConfirm={handleRoleChangeConfirm}
        onOpenChange={(open) => {
          if (!open) setRoleChangeConfirm(null);
        }}
      />

      {/* 重置密码弹窗 */}
      <Dialog
        open={passwordResetTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPasswordResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium text-[#1C1917]">重置登录密码</DialogTitle>
            <DialogDescription>
              为「{passwordResetTarget?.name}」设置新的临时登录密码（至少 6 位）。
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-1.5">
            <label className="text-[13px] font-medium text-[#292524] block">新密码</label>
            <Input
              type="text"
              placeholder="输入至少 6 位的新密码"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordResetTarget(null);
                setNewPassword("");
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              disabled={isPending || newPassword.trim().length < 6}
              onClick={handleResetPassword}
              className="bg-[#D97757] hover:bg-[#C46A4D]"
            >
              {isPending ? "重置中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
