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
  Plus,
  Trash2,
  ShieldAlert,
  Sparkles,
  X,
  Search,
  KeyRound,
  Settings,
  RefreshCw,
  Archive,
  RotateCcw,
  ChevronDown,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

import {
  createTeam,
  deleteTeam,
  updatePermissions,
  changeRole,
  resetMemberPassword,
  updateMemberTeam,
  removeMemberFromTeam,
  archiveMember,
  restoreMember,
} from "../actions";

import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "../join-request-actions";

import { ExemptionDialog } from "../豁免弹窗";
import { findFocusMember } from "@/lib/admin/find-focus-member";
import { MemberPermissionEditor } from "../components/member-permission-editor";

import type { PermissionManagerMember } from "../权限管理";

import { PERMISSION_CATEGORIES, PERMISSION_KEYS } from "@/types";
import type {
  CompanyRole,
  DataScope,
  ExemptionCategory,
  PermissionCategory,
  PermissionKey,
  Permissions,
  UserRole,
  UserStatus,
} from "@/types";
import type { ExemptionType } from "@/lib/豁免";
import {
  ALL_TEAMS_ID,
  countProfilesInTeamForView,
  filterProfilesForMemberView,
  formatLastLoginDisplay,
  getSelectableCurrentScreenMemberIds,
  getVisibleTeamOptions,
  isProfileExemptOnDate,
  resolveDefaultSelectedTeamId,
  retainSelectableMemberIds,
  resolveSelectedTeamAfterTeamDelete,
} from "./team-view-logic";

/* ─── Types ─── */

interface ProfileSummary {
  id: string;
  name: string;
  email: string | null;
  last_sign_in_at?: string | null;
  role: UserRole;
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

interface TeamOption {
  id: string;
  name: string;
}

interface PendingRequest {
  id: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string | null;
  targetTeamId: string;
  targetTeamName: string;
  createdAt: string;
}

interface TeamV3ContentProps {
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
      teamIds: string[] | null;
    };
    teams: TeamOption[];
    profiles: unknown[];
  };
  pendingRequests: PendingRequest[];
  defaultDate: string;
  focusMemberId?: string;
}

type AiSuggestion = {
  label: string;
  description: string;
  action: {
    type: "execute_tool" | "navigate";
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    href?: string;
  };
};

/* ─── Helpers ─── */

function truncateTeamName6(name?: string | null): string {
  if (!name) return "未分配";
  if (name.length <= 6) return name;
  return name.slice(0, 6) + "…";
}

function normalizeUserStatus(value: string | null | undefined): UserStatus {
  return value === "exempt" ? "exempt" : "active";
}

function normalizeExemptionType(
  value: string | null | undefined,
): ExemptionType | null {
  return value === "permanent" || value === "temporary" ? value : null;
}

function normalizeExemptionCategory(
  value: string | null | undefined,
): ExemptionCategory | null {
  return value === "waive" || value === "leave" ? value : null;
}

function roleLabel(role: string): string {
  if (role === "owner") return "创始人";
  if (role === "admin") return "管理员";
  return "成员";
}

/* ─── Component ─── */

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
  defaultDate,
  focusMemberId,
}: TeamV3ContentProps) {
  const router = useRouter();
  const isGroupMode = Boolean(currentUserGroupMode);
  const isCompanyOwner =
    currentUserCompanyRole === "company_owner" ||
    currentUserBusinessRole === "owner" ||
    currentUserRole === "owner";
  const canManageCompany = isCompanyOwner || isGroupMode;

  const canChangeRole = canManageCompany || permissionManagerCapabilities.canChangeRole;
  const canResetPassword = canManageCompany || currentUserPermissions.manage_members === true;
  const canManageExemption =
    canManageCompany ||
    currentUserPermissions.manage_fulfillment === true ||
    currentUserPermissions.manage_members === true ||
    currentUserPermissions.review_violations === true;
  const canArchive = canManageCompany;

  const initialVisibleTeams = getVisibleTeamOptions({
    isOwner: isGroupMode,
    groupMode: isGroupMode,
    allTeams: initialTeams,
    manageableTeams: teamManagement.teams,
  });

  const initialSelectedTeamId = resolveDefaultSelectedTeamId({
    currentUserId,
    profiles: allProfiles,
    visibleTeams: initialVisibleTeams,
    isOwner: isGroupMode,
    groupMode: isGroupMode,
  });

  /* ─── State ─── */

  const [localTeams, setLocalTeams] = useState<TeamOption[]>(initialVisibleTeams);
  const [localProfiles, setLocalProfiles] = useState<ProfileSummary[]>(allProfiles);
  const [localArchivedProfiles, setLocalArchivedProfiles] = useState<ProfileSummary[]>(
    initialArchivedProfiles,
  );
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(
    initialPendingRequests,
  );
  const [memberView, setMemberView] = useState<"active" | "archived">("active");
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialSelectedTeamId);
  const [newTeamName, setNewTeamName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [passwordResetTarget, setPasswordResetTarget] = useState<ProfileSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [removeTarget, setRemoveTarget] = useState<ProfileSummary | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<ProfileSummary | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProfileSummary | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<ProfileSummary | null>(null);
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<TeamOption | null>(null);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Permissions>({});
  const [draftDataScope, setDraftDataScope] = useState<DataScope>("self");
  const [exemptionMemberId, setExemptionMemberId] = useState<string | null>(null);
  const [teamManagementDialogOpen, setTeamManagementDialogOpen] = useState(false);
  const [sortOption, setSortOption] = useState<"role" | "published">("role");
  const [restoredFocusId, setRestoredFocusId] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [batchArchiveOpen, setBatchArchiveOpen] = useState(false);
  const [batchArchiveReason, setBatchArchiveReason] = useState("");

  const [aiSuggestion, setAiSuggestion] = useState<{
    status: "normal" | "warning" | "critical";
    summary: string;
    suggestions: AiSuggestion[];
    loading: boolean;
  } | null>(null);
  const [executingAiKey, setExecutingAiKey] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [isSavingPermissions, startSavingPermissions] = useTransition();

  /* ─── Sync props → state ─── */

  useEffect(() => {
    setLocalProfiles(allProfiles);
    setLocalArchivedProfiles(initialArchivedProfiles);
  }, [allProfiles, initialArchivedProfiles]);

  useEffect(() => {
    setLocalTeams(initialVisibleTeams);
  }, [initialVisibleTeams]);

  useEffect(() => {
    if (selectedTeamId === ALL_TEAMS_ID && initialSelectedTeamId !== ALL_TEAMS_ID) {
      setSelectedTeamId(initialSelectedTeamId);
    }
  }, [initialSelectedTeamId, selectedTeamId]);

  useEffect(() => {
    if (selectedTeamId !== ALL_TEAMS_ID && !localTeams.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(ALL_TEAMS_ID);
    }
  }, [localTeams, selectedTeamId]);

  /* ─── Fetch emails ─── */

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
            prev.map((p) => ({ ...p, email: payload.emails[p.id] ?? p.email })),
          );
        }
      } catch {}
    }
    void fetchEmails();
    return () => { active = false; };
  }, []);

  /* ─── Focus member from URL ─── */

  const appliedFocusMemberId = useRef<string | null>(null);
  useEffect(() => {
    if (!focusMemberId) return;
    if (appliedFocusMemberId.current === focusMemberId) return;
    const member = findFocusMember(localProfiles, focusMemberId);
    if (!member) return;
    appliedFocusMemberId.current = focusMemberId;
    setSelectedTeamId(ALL_TEAMS_ID);
    setSearchQuery("");
    setActiveMemberId(member.id);
  }, [focusMemberId, localProfiles]);

  /* ─── Derived data ─── */

  const profilesForCurrentView =
    memberView === "archived" ? localArchivedProfiles : localProfiles;

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
    if (sortOption === "published") {
      list.sort((a, b) => (b.monthly_published_count ?? 0) - (a.monthly_published_count ?? 0));
    } else {
      const roleRank: Record<string, number> = { owner: 1, admin: 2, member: 3 };
      list.sort((a, b) => (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9));
    }
    return list;
  }, [filteredProfiles, sortOption]);

  const selectableFilteredMemberIds = useMemo(() => {
    return getSelectableCurrentScreenMemberIds(filteredProfiles, currentUserId);
  }, [filteredProfiles, currentUserId]);

  useEffect(() => {
    setSelectedMemberIds((prev) => {
      const next = retainSelectableMemberIds(prev, selectableFilteredMemberIds);
      return next.length === prev.length ? prev : next;
    });
  }, [selectableFilteredMemberIds]);

  /* ─── Active member (drawer) ─── */

  const activeMember = useMemo(() => {
    return localProfiles.find((p) => p.id === activeMemberId) ?? null;
  }, [localProfiles, activeMemberId]);

  const activeMemberIsOwner = activeMember?.role === "owner";
  const activeMemberIsCurrentlyExempt = activeMember
    ? isProfileExemptOnDate(activeMember, defaultDate)
    : false;

  const initialPermissions = useMemo<Permissions>(() => {
    if (!activeMember) return {};
    if (activeMemberIsOwner) {
      const all: Permissions = {};
      for (const k of PERMISSION_KEYS) all[k] = true;
      return all;
    }
    return activeMember.permissions || {};
  }, [activeMember, activeMemberIsOwner]);

  const initialDataScope = useMemo<DataScope>(() => {
    if (!activeMember) return "self";
    if (activeMemberIsOwner) return "all";
    return activeMember.data_scope || "self";
  }, [activeMember, activeMemberIsOwner]);

  useEffect(() => {
    if (activeMember) {
      setDraftPermissions(initialPermissions);
      setDraftDataScope(initialDataScope);
    } else {
      setDraftPermissions({});
      setDraftDataScope("self");
    }
  }, [activeMember, initialPermissions, initialDataScope]);

  const isDirty = useMemo(() => {
    if (!activeMember || activeMemberIsOwner) return false;
    const sameDataScope = draftDataScope === initialDataScope;
    const samePerms = PERMISSION_KEYS.every(
      (key) => (draftPermissions[key] === true) === (initialPermissions[key] === true),
    );
    return !sameDataScope || !samePerms;
  }, [activeMember, activeMemberIsOwner, draftDataScope, initialDataScope, draftPermissions, initialPermissions]);

  const activePermissionMember = useMemo<PermissionManagerMember | null>(() => {
    if (!activeMember) return null;
    return {
      id: activeMember.id,
      name: activeMember.name,
      email: activeMember.email,
      role: activeMember.role,
      teamId: activeMember.team_id,
      teamName: activeMember.team_name,
      permissions: activeMember.permissions || {},
      data_scope: activeMember.data_scope || "self",
      status: normalizeUserStatus(activeMember.status),
    };
  }, [activeMember]);

  /* ─── Permission draft handlers ─── */

  const handleTogglePermission = useCallback(
    (key: PermissionKey, checked: boolean) => {
      if (activeMemberIsOwner) return;
      setDraftPermissions((prev) => ({ ...prev, [key]: checked }));
    },
    [activeMemberIsOwner],
  );

  const handleToggleCategory = useCallback(
    (category: PermissionCategory) => {
      if (activeMemberIsOwner) return;
      const keys = PERMISSION_CATEGORIES[category];
      const allChecked = keys.every((k) => draftPermissions[k] === true);
      setDraftPermissions((prev) => {
        const next = { ...prev };
        for (const k of keys) next[k] = !allChecked;
        return next;
      });
    },
    [activeMemberIsOwner, draftPermissions],
  );

  const handleToggleAllPermissions = useCallback(() => {
    if (activeMemberIsOwner) return;
    const isAllChecked = PERMISSION_KEYS.every((k) => draftPermissions[k] === true);
    setDraftPermissions(() => {
      const next: Permissions = {};
      if (!isAllChecked) for (const k of PERMISSION_KEYS) next[k] = true;
      return next;
    });
  }, [activeMemberIsOwner, draftPermissions]);

  const handleChangeDataScope = useCallback(
    (scope: DataScope) => {
      if (activeMemberIsOwner) return;
      setDraftDataScope(scope);
    },
    [activeMemberIsOwner],
  );

  const handleResetDraft = useCallback(() => {
    setDraftPermissions(initialPermissions);
    setDraftDataScope(initialDataScope);
  }, [initialPermissions, initialDataScope]);

  /* ─── Team management ─── */

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
        feedbackToast.error(res.error);
      } else if (res.team) {
        setLocalTeams((prev) => prev.map((t) => (t.id === tempId ? res.team! : t)));
        router.refresh();
      }
    });
  };

  const handleDeleteTeam = (team: TeamOption) => {
    setDeleteTeamTarget(null);
    const hasMembers = localProfiles.some((p) => p.team_id === team.id);
    if (hasMembers) {
      feedbackToast.error("该团队下还有成员，无法删除");
      return;
    }
    setLocalTeams((prev) => prev.filter((t) => t.id !== team.id));
    setSelectedTeamId((current) => resolveSelectedTeamAfterTeamDelete(current, team.id));
    startTransition(async () => {
      const res = await deleteTeam(team.id);
      if (res.error) {
        setLocalTeams((prev) => [...prev, team]);
        feedbackToast.error(res.error);
      } else {
        router.refresh();
      }
    });
  };

  /* ─── Join request ─── */

  const handleReviewJoinRequest = (requestId: string, action: "approve" | "reject") => {
    const targetRequest = pendingRequests.find((r) => r.id === requestId);
    if (!targetRequest) return;
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    startTransition(async () => {
      const actionFn = action === "approve" ? approveJoinRequestAction : rejectJoinRequestAction;
      const res = await actionFn(requestId, "通过管理员工作台一键审批");
      if (!res.ok) {
        setPendingRequests((prev) => [...prev, targetRequest]);
        feedbackToast.error(res.error);
      } else {
        const response = await fetch("/api/admin/modules/member-emails", { cache: "no-store" });
        if (response.ok) router.refresh();
      }
    });
  };

  /* ─── Member mutations ─── */

  const handleToggleRole = () => {
    if (!roleChangeTarget) return;
    const member = roleChangeTarget;
    setRoleChangeTarget(null);
    const newRole = member.role === "admin" ? "member" : "admin";
    const prevProfiles = localProfiles;
    setLocalProfiles((prev) =>
      prev.map((p) => (p.id === member.id ? { ...p, role: newRole } : p)),
    );
    startTransition(async () => {
      const res = await changeRole(member.id, newRole);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleTransferMemberTeam = (memberId: string, teamId: string | null) => {
    const prevProfiles = localProfiles;
    const targetTeam = localTeams.find((t) => t.id === teamId);
    setLocalProfiles((prev) =>
      prev.map((p) =>
        p.id === memberId ? { ...p, team_id: teamId, team_name: targetTeam?.name ?? null } : p,
      ),
    );
    startTransition(async () => {
      const res = await updateMemberTeam(memberId, teamId);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleRemoveMemberFromTeam = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    const prevProfiles = localProfiles;
    setLocalProfiles((prev) =>
      prev.map((p) =>
        p.id === target.id ? { ...p, team_id: null, team_name: null } : p,
      ),
    );
    startTransition(async () => {
      const res = await removeMemberFromTeam(target.id);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        setRemoveTarget(target);
        feedbackToast.error(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleArchiveMember = () => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    const reason = archiveReason.trim() || "离职/管理员归档";
    const previousProfiles = localProfiles;
    setArchiveTarget(null);
    setArchiveReason("");
    setLocalProfiles((prev) => prev.filter((p) => p.id !== target.id));
    if (activeMemberId === target.id) setActiveMemberId(null);
    startTransition(async () => {
      const res = await archiveMember(target.id, reason);
      if (res.error) {
        setLocalProfiles(previousProfiles);
        setArchiveTarget(target);
        feedbackToast.error(res.error);
        return;
      }
      router.refresh();
    });
  };

  const handleRestoreMember = () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    const previousArchivedProfiles = localArchivedProfiles;
    const previousProfiles = localProfiles;
    setRestoreTarget(null);
    setLocalArchivedProfiles((prev) => prev.filter((p) => p.id !== target.id));
    setLocalProfiles((prev) => [
      ...prev,
      {
        ...target,
        role: "member",
        membership_status: "active",
        team_id: null,
        team_name: null,
        permissions: {},
      },
    ]);
    startTransition(async () => {
      const res = await restoreMember(target.id);
      if (res.error) {
        setLocalArchivedProfiles(previousArchivedProfiles);
        setLocalProfiles(previousProfiles);
        setRestoreTarget(target);
        feedbackToast.error(res.error);
        return;
      }
      setMemberView("active");
      setSelectedTeamId(ALL_TEAMS_ID);
      setSearchQuery("");
      setRestoredFocusId(target.id);
      setTimeout(() => setRestoredFocusId(null), 3000);
      router.refresh();
    });
  };

  /* ─── Batch operations ─── */

  const handleBatchTransferTeam = (teamId: string) => {
    if (selectedMemberIds.length === 0) return;
    const targetTeam = localTeams.find((t) => t.id === teamId);
    const ids = [...selectedMemberIds];
    const prevProfiles = localProfiles;
    setLocalProfiles((prev) =>
      prev.map((p) =>
        ids.includes(p.id)
          ? { ...p, team_id: teamId || null, team_name: targetTeam ? targetTeam.name : null }
          : p,
      ),
    );
    setSelectedMemberIds([]);
    startTransition(async () => {
      let failCount = 0;
      for (const id of ids) {
        const res = await updateMemberTeam(id, teamId || null);
        if (res.error) failCount++;
      }
      if (failCount > 0) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error(`部分成员划转失败 (${failCount}/${ids.length})`);
      } else {
        router.refresh();
      }
    });
  };

  const handleBatchArchive = () => {
    if (selectedMemberIds.length === 0) return;
    const reason = batchArchiveReason.trim() || "批量归档（离职）";
    const ids = [...selectedMemberIds];
    const prevProfiles = localProfiles;
    setBatchArchiveOpen(false);
    setBatchArchiveReason("");
    setLocalProfiles((prev) => prev.filter((p) => !ids.includes(p.id)));
    setSelectedMemberIds([]);
    startTransition(async () => {
      let failCount = 0;
      for (const id of ids) {
        const res = await archiveMember(id, reason);
        if (res.error) failCount++;
      }
      if (failCount > 0) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error(`部分账号归档失败 (${failCount}/${ids.length})`);
      } else {
        router.refresh();
      }
    });
  };

  /* ─── Password reset ─── */

  const handleResetPassword = () => {
    if (!passwordResetTarget) return;
    const target = passwordResetTarget;
    const pwd = newPassword.trim();
    if (pwd.length < 6) {
      feedbackToast.error("新密码至少需要 6 位");
      return;
    }
    if (pwd !== confirmPassword.trim()) {
      feedbackToast.error("两次输入的密码不一致");
      return;
    }
    feedbackToast.success("正在重置密码...");
    startTransition(async () => {
      const res = await resetMemberPassword(target.id, pwd);
      if (res.error) {
        feedbackToast.error(res.error);
      } else {
        setPasswordResetTarget(null);
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  };

  /* ─── Drawer ─── */

  const handleSelectMember = (member: ProfileSummary) => {
    if (activeMemberId === member.id) {
      setActiveMemberId(null);
      setAiSuggestion(null);
      return;
    }
    setActiveMemberId(member.id);
    setAiSuggestion(null);
  };

  const handleSavePermissionsEditor = useCallback(
    (newPerms: Permissions, newDataScope: DataScope) => {
      if (!activeMemberId || !activeMember) return;
      const prevProfiles = localProfiles;
      setLocalProfiles((prev) =>
        prev.map((p) =>
          p.id === activeMemberId ? { ...p, permissions: newPerms, data_scope: newDataScope } : p,
        ),
      );
      startSavingPermissions(async () => {
        const res = await updatePermissions(activeMemberId, newPerms, newDataScope);
        if (res.error) {
          setLocalProfiles(prevProfiles);
          feedbackToast.error(res.error);
        } else {
          router.refresh();
        }
      });
    },
    [activeMemberId, activeMember, localProfiles, router],
  );

  /* ─── AI suggestions ─── */

  const handleFetchAiSuggestion = async () => {
    if (!activeMemberId) return;
    setAiSuggestion({ status: "normal", summary: "", suggestions: [], loading: true });
    try {
      const res = await fetch("/api/admin/member-ai-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: activeMemberId }),
      });
      if (!res.ok) throw new Error("API request failed");
      const payload = await res.json();
      setAiSuggestion({
        status: payload.status || "normal",
        summary: payload.summary || "权限状态良好，与岗位职责高度契合。",
        suggestions: payload.suggestions || [],
        loading: false,
      });
    } catch {
      feedbackToast.error("网络异常，请检查连接后重试");
      setAiSuggestion({
        status: "critical",
        summary: "网络异常，请检查网络连接后重试。",
        suggestions: [],
        loading: false,
      });
    }
  };

  const handleExecuteAiSuggestion = async (suggestion: AiSuggestion, key: string) => {
    if (executingAiKey) return;
    if (suggestion.action.type === "navigate" && suggestion.action.href) {
      router.push(suggestion.action.href);
      return;
    }
    if (!suggestion.action.toolName) {
      toast.info("已切换到 AI 助手对话，请在对话框继续");
      return;
    }
    setExecutingAiKey(key);
    try {
      const res = await fetch("/api/admin/execute-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: suggestion.action.toolName,
          toolArgs: suggestion.action.toolArgs ?? {},
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        feedbackToast.error(payload.error || "AI 执行失败");
      } else {
        void handleFetchAiSuggestion();
        router.refresh();
      }
    } catch {
      feedbackToast.error("执行超时或网络异常");
    } finally {
      setExecutingAiKey(null);
    }
  };

  /* ─── Toggle select-all ─── */

  const handleToggleSelectAll = () => {
    const allIds = selectableFilteredMemberIds;
    const isAllSelected = allIds.every((id) => selectedMemberIds.includes(id));
    if (isAllSelected) {
      setSelectedMemberIds((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      setSelectedMemberIds((prev) => Array.from(new Set([...prev, ...allIds])));
    }
  };

  /* ─── Render ─── */

  return (
    <div className="mt-4 w-full space-y-5 relative">
      <main className="space-y-5">

        {/* ── Pending requests ── */}
        {pendingRequests.length > 0 && (
          <section className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-5 py-4">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-[13px] font-medium text-zinc-900">待审批入团申请</span>
              <span className="text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                {pendingRequests.length}
              </span>
            </div>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-zinc-900">{req.applicantName}</span>
                    <span className="mx-2 text-zinc-300">·</span>
                    <span className="text-[12px] text-zinc-500">{req.targetTeamName}</span>
                    <span className="mx-2 text-zinc-300">·</span>
                    <span className="text-[11px] text-zinc-400">
                      {new Date(req.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      onClick={() => handleReviewJoinRequest(req.id, "reject")}
                      disabled={isPending}
                      className="h-7 px-2.5 text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700 rounded-md"
                    >
                      拒绝
                    </Button>
                    <Button
                      onClick={() => handleReviewJoinRequest(req.id, "approve")}
                      disabled={isPending}
                      className="h-7 px-2.5 text-[12px] bg-zinc-900 text-white hover:bg-zinc-800 rounded-md"
                    >
                      同意
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Toolbar + Member table ── */}
        <section className="rounded-xl border border-zinc-200 bg-white">

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-zinc-100">
            <div className="flex flex-wrap items-center gap-2">
              {/* Team selector */}
              <div className="relative">
                <select
                  value={selectedTeamId}
                  onChange={(e) => {
                    if (e.target.value === "__manage__") {
                      setTeamManagementDialogOpen(true);
                    } else {
                      setSelectedTeamId(e.target.value);
                    }
                  }}
                  className="h-8 pl-3 pr-7 text-[12px] font-medium bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-lg outline-none cursor-pointer appearance-none hover:border-zinc-300 transition-colors"
                >
                  <option value={ALL_TEAMS_ID}>
                    {memberView === "archived" ? "归档大盘" : "全员"} ({profilesForCurrentView.length})
                  </option>
                  {localTeams.map((t) => {
                    const count = countProfilesInTeamForView(profilesForCurrentView, memberView, t.id);
                    return (
                      <option key={t.id} value={t.id}>
                        {truncateTeamName6(t.name)} ({count})
                      </option>
                    );
                  })}
                  {canManageCompany && <option value="__manage__">管理架构…</option>}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2 size-3 text-zinc-400" />
              </div>

              {/* Sort */}
              <div className="relative">
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as "role" | "published")}
                  className="h-8 pl-3 pr-7 text-[12px] bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-lg outline-none cursor-pointer appearance-none hover:border-zinc-300 transition-colors"
                >
                  <option value="role">按职位</option>
                  <option value="published">按发布</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2 size-3 text-zinc-400" />
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2 size-3.5 text-zinc-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索…"
                  className="h-8 pl-8 pr-3 text-[12px] bg-zinc-50 border-zinc-200 rounded-lg w-40 focus:w-56 transition-all"
                />
              </div>

              {canManageCompany && (
                <Button
                  variant="ghost"
                  onClick={() => setTeamManagementDialogOpen(true)}
                  className="h-8 px-2.5 text-[12px] text-zinc-500 hover:text-zinc-700 rounded-lg"
                >
                  <Settings className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex items-center bg-zinc-100 rounded-lg p-0.5" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={memberView === "active"}
                  onClick={() => setMemberView("active")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-md transition-colors",
                    memberView === "active"
                      ? "bg-white text-zinc-900 shadow-sm font-medium"
                      : "text-zinc-500 hover:text-zinc-700",
                  )}
                >
                  正常 {localProfiles.length}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={memberView === "archived"}
                  onClick={() => { setMemberView("archived"); setActiveMemberId(null); setSelectedMemberIds([]); }}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-md transition-colors",
                    memberView === "archived"
                      ? "bg-white text-zinc-900 shadow-sm font-medium"
                      : "text-zinc-500 hover:text-zinc-700",
                  )}
                >
                  归档 {localArchivedProfiles.length}
                </button>
              </div>

              <span className="text-[11px] text-zinc-400 tabular-nums">
                {filteredProfiles.length}/{profilesForCurrentView.length}
              </span>
            </div>
          </div>

          {/* Table header */}
          {sortedProfiles.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-2 text-[11px] text-zinc-400 uppercase tracking-wider border-b border-zinc-100">
              {canManageCompany && memberView === "active" && (
                <div className="w-6 shrink-0">
                  <Checkbox
                    checked={
                      selectableFilteredMemberIds.length > 0 &&
                      selectableFilteredMemberIds.every((id) => selectedMemberIds.includes(id))
                    }
                    onCheckedChange={handleToggleSelectAll}
                    className="size-3.5 rounded border-zinc-300 data-[state=checked]:bg-zinc-900 data-[state=checked]:border-zinc-900"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">成员</div>
              <div className="w-16 text-center shrink-0">角色</div>
              <div className="w-24 shrink-0">团队</div>
              <div className="w-16 text-right shrink-0">发布</div>
            </div>
          )}

          {/* Member rows */}
          {sortedProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UsersRound className="size-8 text-zinc-300 mb-3" />
              <p className="text-[13px] text-zinc-500">没有找到成员</p>
              <p className="text-[12px] text-zinc-400 mt-1">调整筛选或搜索条件试试</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {sortedProfiles.map((member) => {
                const isArchivedView = memberView === "archived";
                const isCurrentMemberActive = activeMemberId === member.id;
                const isRestoredFocus = restoredFocusId === member.id;
                const isChecked = selectedMemberIds.includes(member.id);
                const isCurrentlyExempt = !isArchivedView && isProfileExemptOnDate(member, defaultDate);
                const archiveSnapshot = member.archive_snapshot ?? {};
                const archivedTeamName =
                  typeof archiveSnapshot.team_name === "string" ? archiveSnapshot.team_name : "未分配";
                const archivedRole =
                  typeof archiveSnapshot.role === "string"
                    ? archiveSnapshot.role === "admin" ? "管理员" : "成员"
                    : "成员";

                return (
                  <div
                    key={member.id}
                    className={cn(
                      "group flex items-center gap-3 px-5 py-3 transition-colors",
                      isRestoredFocus
                        ? "bg-amber-50 animate-pulse"
                        : isChecked
                          ? "bg-zinc-50"
                          : isCurrentMemberActive
                            ? "bg-zinc-50/60"
                            : "hover:bg-zinc-50/60",
                    )}
                  >
                    {/* Checkbox */}
                    {canManageCompany && !isArchivedView && member.id !== currentUserId && (
                      <div className="w-6 shrink-0">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedMemberIds((prev) => Array.from(new Set([...prev, member.id])));
                            } else {
                              setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
                            }
                          }}
                          className="size-3.5 rounded border-zinc-300 data-[state=checked]:bg-zinc-900 data-[state=checked]:border-zinc-900"
                        />
                      </div>
                    )}

                    {/* Name + email (clickable) */}
                    <div
                      role="button"
                      tabIndex={isArchivedView ? -1 : 0}
                      className="flex-1 min-w-0 cursor-pointer select-none"
                      onClick={() => {
                        if (isArchivedView) return;
                        if (selectedMemberIds.length > 0) {
                          if (member.id === currentUserId) return;
                          if (isChecked) {
                            setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
                          } else {
                            setSelectedMemberIds((prev) => [...prev, member.id]);
                          }
                          return;
                        }
                        handleSelectMember(member);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (!isArchivedView && !selectedMemberIds.length) handleSelectMember(member);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-zinc-900 truncate">
                          {member.name}
                        </span>
                        {member.id === currentUserId && (
                          <span className="text-[10px] text-zinc-400 border border-zinc-200 px-1 rounded">
                            我
                          </span>
                        )}
                        {isCurrentlyExempt && (
                          <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                            豁免
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400 truncate block">
                        {member.email || "—"}
                      </span>
                    </div>

                    {/* Role badge */}
                    <div className="w-16 text-center shrink-0">
                      {isArchivedView ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                          <Archive className="size-3" />
                          已归档
                        </span>
                      ) : member.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-900 font-medium">
                          <span className="size-1.5 rounded-full bg-zinc-900" />
                          管理员
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500">成员</span>
                      )}
                    </div>

                    {/* Team */}
                    <div className="w-24 shrink-0">
                      {isArchivedView ? (
                        <span className="text-[11px] text-zinc-400">{truncateTeamName6(archivedTeamName)}</span>
                      ) : !canManageCompany || member.id === currentUserId ? (
                        <span className="text-[11px] text-zinc-600">{truncateTeamName6(member.team_name)}</span>
                      ) : (
                        <div className="relative inline-flex items-center">
                          <select
                            value={member.team_id ?? ""}
                            onChange={(e) =>
                              handleTransferMemberTeam(member.id, e.target.value ? e.target.value : null)
                            }
                            className="h-6 pl-2 pr-5 text-[11px] bg-transparent text-zinc-600 border border-transparent hover:border-zinc-200 hover:bg-zinc-50 rounded outline-none cursor-pointer appearance-none transition-colors max-w-[96px] truncate"
                          >
                            <option value="">未分配</option>
                            {localTeams.map((t) => (
                              <option key={t.id} value={t.id}>{truncateTeamName6(t.name)}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-0.5 top-1.5 size-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                    </div>

                    {/* Published count */}
                    <div className="w-16 text-right shrink-0">
                      {isArchivedView ? (
                        <span className="text-[11px] text-zinc-400">{archivedRole}</span>
                      ) : (
                        <span className="text-[12px] tabular-nums text-zinc-500">
                          {member.monthly_published_count ?? 0}/{member.monthly_required_count ?? 0}
                        </span>
                      )}
                    </div>

                    {/* Archived: restore button */}
                    {isArchivedView && canManageCompany && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRestoreTarget(member)}
                        disabled={isPending}
                        className="h-7 px-2 text-[11px] text-zinc-500 hover:text-zinc-700 shrink-0"
                      >
                        <RotateCcw className="size-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── Right-side detail drawer ── */}
      <Sheet
        open={activeMember !== null}
        onOpenChange={(open) => {
          if (!open) { setActiveMemberId(null); setAiSuggestion(null); }
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full max-w-[480px] gap-0 overflow-hidden p-0 shadow-2xl"
        >
          {activeMember && activePermissionMember ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* 顶栏信息 */}
              <div className="flex items-start justify-between border-b border-zinc-200 p-5 bg-white shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="text-base font-semibold text-zinc-900">
                      {activeMember.name}
                    </SheetTitle>
                    <span
                      className={cn(
                        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium border",
                        activeMember.role === "owner"
                          ? "bg-zinc-900 border-zinc-900 text-white"
                          : activeMember.role === "admin"
                            ? "bg-white border-zinc-300 text-zinc-900"
                            : "bg-zinc-100 border-transparent text-zinc-700",
                      )}
                    >
                      {activeMember.role === "owner"
                        ? "创始人"
                        : activeMember.role === "admin"
                          ? "管理员"
                          : "成员"}
                    </span>
                  </div>
                  <SheetDescription className="text-[12px] text-zinc-500 leading-normal mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      {activeMember.team_name || "未分配团队"} ·{" "}
                      {activeMember.email || "邮箱同步中"}
                    </span>
                    <span className="text-zinc-300">|</span>
                    {(() => {
                      const loginInfo = formatLastLoginDisplay(activeMember.last_sign_in_at);
                      return (
                        <span
                          title="这是 Supabase Auth 记录的上次登录时间，不等于当前在线时间或最后访问时间"
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors",
                            loginInfo.isLoginStale
                              ? "bg-zinc-950/10 text-zinc-600 border border-zinc-200"
                              : "bg-zinc-100 text-zinc-600",
                          )}
                        >
                          <Clock className="size-3 shrink-0 text-zinc-400" />
                          上次登录：{loginInfo.text}
                        </span>
                      );
                    })()}
                  </SheetDescription>
                </div>

                <div className="flex items-center gap-1">
                  {permissionManagerCapabilities.canEditPermissions && (
                    <Button
                      variant="outline"
                      onClick={handleFetchAiSuggestion}
                      disabled={aiSuggestion?.loading}
                      className="h-8 text-[12px] rounded-lg border-zinc-200 hover:bg-zinc-50 flex items-center gap-1 px-2.5"
                    >
                      <Sparkles className="size-3 text-zinc-500" />
                      AI 诊断
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setActiveMemberId(null); setAiSuggestion(null); }}
                    aria-label="关闭成员权限详情"
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-all"
                  >
                    <X className="size-4.5" />
                  </button>
                </div>
              </div>

              {/* 唯一主滚动区 */}
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                {aiSuggestion && (
                  <div
                    className={cn(
                      "rounded-xl border-l-2 bg-zinc-50 p-4 space-y-3",
                      aiSuggestion.status === "critical"
                        ? "border-l-red-400"
                        : "border-l-zinc-300",
                    )}
                  >
                    {aiSuggestion.loading ? (
                      <div className="flex items-center gap-2 text-[12px] text-zinc-500 py-2">
                        <RefreshCw className="size-3.5 animate-spin" />
                        AI 正在深度审查其日常填报及安全审计日志...
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between border-b border-zinc-200/50 pb-2">
                          <span
                            className={cn(
                              "inline-flex rounded px-1.5 py-0.5 text-[12px] font-medium",
                              aiSuggestion.status === "critical"
                                ? "bg-red-100 text-red-600"
                                : "bg-zinc-100 text-zinc-600",
                            )}
                          >
                            {aiSuggestion.status === "critical"
                              ? "安全警告"
                              : "诊断建议"}
                          </span>
                          <span className="text-[12px] text-zinc-500">
                            AI 推理建议
                          </span>
                        </div>
                        <p className="text-[12px] text-zinc-700 leading-relaxed">
                          {aiSuggestion.summary}
                        </p>

                        {aiSuggestion.suggestions.length > 0 ? (
                          aiSuggestion.suggestions.map((sug, idx) => {
                            const key = `${sug.label}-${idx}`;
                            const isBusy = executingAiKey === key;
                            return (
                              <div
                                key={idx}
                                className="bg-white rounded-lg border border-zinc-200 p-2.5 flex items-start justify-between gap-3"
                              >
                                <div className="space-y-0.5">
                                  <h5 className="text-[12px] font-medium text-zinc-900">
                                    {sug.label}
                                  </h5>
                                  <p className="text-[12px] text-zinc-500 leading-relaxed">
                                    {sug.description}
                                  </p>
                                </div>
                                <Button
                                  onClick={() =>
                                    void handleExecuteAiSuggestion(sug, key)
                                  }
                                  disabled={Boolean(executingAiKey)}
                                  className="h-7 px-2.5 bg-zinc-900 text-white hover:bg-zinc-800 rounded text-[12px] shrink-0"
                                >
                                  {isBusy ? "执行中..." : "一键部署"}
                                </Button>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex justify-end pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleFetchAiSuggestion}
                              className="h-7 px-2.5 text-[12px] border-zinc-200 rounded-lg text-zinc-700 hover:bg-zinc-100"
                            >
                              <RefreshCw className="size-3 mr-1 text-zinc-500" />
                              重试
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* 成员权限及数据范围受控编辑表单 */}
                <MemberPermissionEditor
                  member={activePermissionMember}
                  draftPermissions={draftPermissions}
                  draftDataScope={draftDataScope}
                  onTogglePermission={handleTogglePermission}
                  onToggleCategory={handleToggleCategory}
                  onToggleAllPermissions={handleToggleAllPermissions}
                  onChangeDataScope={handleChangeDataScope}
                  canEdit={permissionManagerCapabilities.canEditPermissions}
                  isSaving={isSavingPermissions}
                />

                {/* 低权重区：高级账户与团队管理 */}
                {(canManageCompany || permissionManagerCapabilities.canRemoveMember) &&
                  activeMember.id !== currentUserId &&
                  activeMember.role !== "owner" &&
                  activeMember.membership_status !== "archived" && (
                    <div className="pt-4 border-t border-zinc-200/80 space-y-3">
                      <h4 className="text-[12px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                        账户与团队管理
                      </h4>

                      <div className="space-y-1">
                        {canChangeRole && (
                          <button
                            type="button"
                            onClick={() => setRoleChangeTarget(activeMember)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-zinc-700 hover:bg-zinc-100 transition-colors duration-100"
                          >
                            <span className="flex items-center gap-2">
                              <Settings className="size-3.5 text-zinc-400" />
                              {activeMember.role === "admin"
                                ? "降级为普通组员"
                                : "提升为管理员"}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              切换身份
                            </span>
                          </button>
                        )}

                        {canResetPassword && (
                          <button
                            type="button"
                            onClick={() => setPasswordResetTarget(activeMember)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-zinc-700 hover:bg-zinc-100 transition-colors duration-100"
                          >
                            <span className="flex items-center gap-2">
                              <KeyRound className="size-3.5 text-zinc-400" />
                              重置账户密码
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              快捷重置
                            </span>
                          </button>
                        )}

                        {canManageExemption && (
                          <button
                            type="button"
                            onClick={() => setExemptionMemberId(activeMember.id)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-zinc-700 hover:bg-zinc-100 transition-colors duration-100"
                          >
                            <span className="flex items-center gap-2">
                              <ShieldAlert className="size-3.5 text-zinc-400" />
                              {activeMemberIsCurrentlyExempt
                                ? "调整日报豁免"
                                : "开启日报豁免"}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              {activeMemberIsCurrentlyExempt
                                ? "已生效"
                                : "未生效"}
                            </span>
                          </button>
                        )}

                        {permissionManagerCapabilities.canRemoveMember && (
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(activeMember)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-zinc-700 hover:bg-zinc-100 transition-colors duration-100"
                          >
                            <span className="flex items-center gap-2">
                              <UsersRound className="size-3.5 text-zinc-400" />
                              移出团队
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              保留账号
                            </span>
                          </button>
                        )}

                        {canArchive && (
                          <button
                            type="button"
                            onClick={() => { setArchiveTarget(activeMember); setArchiveReason(""); }}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] text-red-600 hover:bg-red-50 transition-colors duration-100"
                          >
                            <span className="flex items-center gap-2">
                              <Archive className="size-3.5 text-red-400" />
                              归档账号
                            </span>
                            <span className="text-[11px] text-red-400/70">
                              高风险操作
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
              </div>

              {/* 唯一固定底栏 */}
              <div className="flex items-center justify-between border-t border-zinc-200 bg-white p-4 px-6 shrink-0">
                <div className="flex items-center gap-2">
                  {isDirty && (
                    <button
                      type="button"
                      onClick={handleResetDraft}
                      disabled={isSavingPermissions}
                      className="text-[12px] text-zinc-500 hover:text-zinc-800 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-100"
                    >
                      <RotateCcw className="size-3" />
                      重置
                    </button>
                  )}
                  {activeMemberIsOwner && (
                    <span className="text-[11px] text-zinc-400">
                      创始人默认拥有全量权限
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { setActiveMemberId(null); setAiSuggestion(null); }}
                    disabled={isSavingPermissions}
                    className="h-9 px-3.5 text-[12px] text-zinc-600 rounded-xl hover:bg-zinc-100"
                  >
                    取消
                  </Button>

                  <Button
                    type="button"
                    onClick={() => handleSavePermissionsEditor(draftPermissions, draftDataScope)}
                    disabled={
                      !isDirty ||
                      !permissionManagerCapabilities.canEditPermissions ||
                      isSavingPermissions ||
                      activeMemberIsOwner
                    }
                    className={cn(
                      "h-9 px-5 rounded-xl text-[12px] font-medium transition-all shadow-xs",
                      isDirty && !isSavingPermissions && !activeMemberIsOwner && permissionManagerCapabilities.canEditPermissions
                        ? "bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer"
                        : "bg-zinc-100 text-zinc-400 cursor-not-allowed shadow-none",
                    )}
                  >
                    {isSavingPermissions
                      ? "保存中..."
                      : isDirty
                        ? "保存变更"
                        : "已是最新"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* ── Dialogs ── */}

      {/* Password reset */}
      <Dialog
        open={passwordResetTarget !== null}
        onOpenChange={(o) => {
          if (!o) { setPasswordResetTarget(null); setNewPassword(""); setConfirmPassword(""); }
        }}
      >
        <DialogContent className="rounded-xl border border-zinc-200 bg-white" showCloseButton>
          <DialogHeader>
            <DialogTitle className="text-[15px]">重置密码</DialogTitle>
            <DialogDescription className="text-[12px]">
              {passwordResetTarget ? `为 ${passwordResetTarget.name} 设置新密码` : ""}
            </DialogDescription>
          </DialogHeader>
          {passwordResetTarget && (
            <div className="space-y-3 pt-2">
              <div className="rounded-lg bg-zinc-50 px-3 py-2 text-[12px]">
                <span className="font-medium text-zinc-900">{passwordResetTarget.name}</span>
                <span className="text-zinc-400 ml-2">{passwordResetTarget.email || "未关联邮箱"}</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v3-new-pwd" className="text-[12px]">新密码</Label>
                <Input
                  id="v3-new-pwd"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="不得少于 6 位"
                  className="h-9 rounded-lg bg-zinc-50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v3-confirm-pwd" className="text-[12px]">确认密码</Label>
                <Input
                  id="v3-confirm-pwd"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="重新输入"
                  className="h-9 rounded-lg bg-zinc-50"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setPasswordResetTarget(null); setNewPassword(""); setConfirmPassword(""); }}
              className="h-9 rounded-lg text-[12px]"
            >
              取消
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={isPending}
              className="h-9 bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg text-[12px]"
            >
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete team */}
      <ConfirmDialog
        open={deleteTeamTarget !== null}
        title="删除团队"
        description={deleteTeamTarget ? `确定删除「${deleteTeamTarget.name}」？此操作不可逆。` : ""}
        confirmText="确认删除"
        destructive
        loading={isPending}
        onConfirm={() => { if (deleteTeamTarget) handleDeleteTeam(deleteTeamTarget); }}
        onOpenChange={(o) => { if (!o) setDeleteTeamTarget(null); }}
      />

      {/* Remove from team */}
      <ConfirmDialog
        open={removeTarget !== null}
        title="移出团队"
        description={removeTarget ? `确定将 ${removeTarget.name} 移出本团队？账号保留，之后可重新分配。` : ""}
        confirmText="确认移出"
        loading={isPending}
        onConfirm={handleRemoveMemberFromTeam}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
      />

      {/* Archive */}
      <ConfirmDialog
        open={archiveTarget !== null}
        title="归档账号"
        description={archiveTarget ? `确定归档 ${archiveTarget.name}？归档后禁止登录并清空权限，历史数据保留。` : ""}
        confirmText="确认归档"
        destructive
        loading={isPending}
        onConfirm={handleArchiveMember}
        onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}
      />

      {/* Restore */}
      <ConfirmDialog
        open={restoreTarget !== null}
        title="恢复账号"
        description={restoreTarget ? `确认恢复 ${restoreTarget.name}？恢复后为未分配团队的普通成员。` : ""}
        confirmText="确认恢复"
        loading={isPending}
        onConfirm={handleRestoreMember}
        onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}
      />

      {/* Exemption */}
      <ExemptionDialog
        open={exemptionMemberId !== null}
        profile={
          exemptionMemberId
            ? (() => {
                const target = localProfiles.find((p) => p.id === exemptionMemberId);
                return target
                  ? {
                      id: target.id,
                      name: target.name,
                      status: normalizeUserStatus(target.status),
                      exempt_type: normalizeExemptionType(target.exempt_type),
                      exempt_start_date: target.exempt_start_date || null,
                      exempt_end_date: target.exempt_end_date || null,
                      exempt_reason: target.exempt_reason || null,
                      exemption_category: normalizeExemptionCategory(target.exemption_category),
                    }
                  : null;
              })()
            : null
        }
        onOpenChange={(o) => {
          if (!o) { setExemptionMemberId(null); router.refresh(); }
        }}
      />

      {/* Batch archive */}
      <ConfirmDialog
        open={batchArchiveOpen}
        title="批量归档"
        description={`确定归档选中的 ${selectedMemberIds.length} 人？归档后禁止登录并清空权限。`}
        confirmText={`确认归档 (${selectedMemberIds.length} 人)`}
        destructive
        loading={isPending}
        onConfirm={handleBatchArchive}
        onOpenChange={(o) => { if (!o) setBatchArchiveOpen(false); }}
      />

      {/* Role change */}
      <ConfirmDialog
        open={roleChangeTarget !== null}
        title="变更角色"
        description={
          roleChangeTarget
            ? `确认将 ${roleChangeTarget.name} 变更为「${roleChangeTarget.role === "admin" ? "普通组员" : "管理员"}」？`
            : ""
        }
        confirmText="确认变更"
        loading={isPending}
        onConfirm={handleToggleRole}
        onOpenChange={(o) => { if (!o) setRoleChangeTarget(null); }}
      />

      {/* ── Batch floating bar ── */}
      {selectedMemberIds.length > 0 && (
        <aside
          aria-label="批量操作"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white/95 backdrop-blur-sm px-4 py-2 shadow-lg"
        >
          <span className="text-[12px] font-medium text-zinc-700 pr-2 border-r border-zinc-200">
            已选 {selectedMemberIds.length} 人
          </span>

          {canManageCompany && (
            <div className="relative">
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) { handleBatchTransferTeam(e.target.value); e.target.value = ""; }
                }}
                className="h-7 text-[11px] bg-zinc-50 border border-zinc-200 rounded-md px-2 pr-5 text-zinc-600 outline-none appearance-none cursor-pointer"
              >
                <option value="" disabled>调配团队…</option>
                {localTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1.5 size-3 text-zinc-400" />
            </div>
          )}

          {canManageCompany && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBatchArchiveOpen(true)}
              className="h-7 px-2 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700 rounded-md"
            >
              <Archive className="size-3 mr-1" />
              归档
            </Button>
          )}

          <button
            type="button"
            onClick={() => setSelectedMemberIds([])}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            title="取消选择"
          >
            <X className="size-3.5" />
          </button>
        </aside>
      )}

      {/* ── Team management dialog ── */}
      <Dialog open={teamManagementDialogOpen} onOpenChange={setTeamManagementDialogOpen}>
        <DialogContent className="max-w-[440px] p-5 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold">团队架构管理</DialogTitle>
            <DialogDescription className="text-[12px] text-zinc-500">
              新建或管理团队分组
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {canManageCompany && (
              <div className="space-y-1.5">
                <Label htmlFor="v3-team-name" className="text-[12px] font-medium text-zinc-600">
                  新建团队
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="v3-team-name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="如: 广州一部"
                    className="h-8 text-[12px] rounded-lg"
                  />
                  <Button
                    onClick={handleCreateTeam}
                    disabled={isPending || !newTeamName.trim()}
                    className="h-8 px-3 bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg text-[12px] shrink-0"
                  >
                    <Plus className="size-3.5 mr-1" />
                    创建
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              <span className="text-[11px] font-medium text-zinc-400">
                现有团队 ({localTeams.length})
              </span>
              {localTeams.length === 0 ? (
                <p className="text-[12px] text-zinc-400 py-2">暂无团队</p>
              ) : (
                localTeams.map((team) => {
                  const count = localProfiles.filter((p) => p.team_id === team.id).length;
                  return (
                    <div
                      key={team.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-100"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="size-1.5 rounded-full bg-zinc-400 shrink-0" />
                        <span className="text-[12px] font-medium text-zinc-800 truncate">{team.name}</span>
                        <span className="text-[10px] text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded shrink-0">
                          {count}
                        </span>
                      </div>
                      {canManageCompany && count === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTeamTarget(team)}
                          className="h-6 px-2 text-[11px] text-red-500 hover:bg-red-50 hover:text-red-600 rounded-md shrink-0"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTeamManagementDialogOpen(false)}
              className="h-8 text-[12px] rounded-lg"
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
