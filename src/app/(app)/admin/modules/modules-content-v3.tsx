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
  Sparkles,
  X,
  Search,
  KeyRound,
  RefreshCw,
  Archive,
  RotateCcw,
  ChevronDown,
  Building2,
  Mail,
  UserMinus,
  Play,
  AlertCircle,
  ArrowRight,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

import {
  createTeam,
  deleteTeam,
  updatePermissions,
  changeRole,
  resetMemberPassword,
  updateMemberTeam,
  archiveMember,
  restoreMember,
  updateExemption,
  clearExemption,
} from "../actions";

import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "../join-request-actions";

import { findFocusMember } from "@/lib/admin/find-focus-member";
import { MemberPermissionEditor } from "../components/member-permission-editor";

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
  type TeamViewTeamOption,
} from "./team-view-logic";

/* ─── Types ─── */

export interface ProfileSummary {
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
  defaultDate: string;
  focusMemberId?: string;
}

type AiSuggestionItem = {
  label: string;
  description: string;
  action:
    | { type: "execute_tool"; toolName: string; toolArgs?: Record<string, unknown> }
    | { type: "navigate"; href: string };
};

/* ─── Helpers ─── */

function truncateTeamName(name?: string | null, maxLen = 8): string {
  if (!name) return "未分配";
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen) + "…";
}

function normalizeUserStatus(value: string | null | undefined): UserStatus {
  return value === "exempt" ? "exempt" : "active";
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
  defaultDate,
  focusMemberId,
}: AdminModulesContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 1. Permission & access context
  const isGroupMode = Boolean(currentUserGroupMode);
  const isOwner =
    currentUserBusinessRole === "owner" ||
    currentUserCompanyRole === "company_owner" ||
    currentUserRole === "owner";
  const isCompanyOwner = currentUserCompanyRole === "company_owner" || isOwner;
  const canManageCompany = isCompanyOwner || isGroupMode;
  const canManageMembers = canManageCompany || currentUserPermissions.manage_members === true;
  const canManageFulfillment = canManageCompany || currentUserPermissions.manage_fulfillment === true;
  const canEditTeamMembers = teamManagement.access.canEditMembers || canManageMembers;

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

  // 3. Main view states
  const [localTeams, setLocalTeams] = useState<TeamOption[]>(visibleTeamOptions);
  const [localProfiles, setLocalProfiles] = useState<ProfileSummary[]>(allProfiles);
  const [localArchivedProfiles, setLocalArchivedProfiles] = useState<ProfileSummary[]>(initialArchivedProfiles);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(initialPendingRequests);
  const [memberView, setMemberView] = useState<"active" | "archived">("active");
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialSelectedTeamId);
  const [sortOption, setSortOption] = useState<"role" | "published">("role");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [restoredFocusId, setRestoredFocusId] = useState<string | null>(null);

  // 4. Drawer (Inspector) states
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "team_role" | "permissions" | "exemption">("overview");
  const [draftPermissions, setDraftPermissions] = useState<Permissions>({});
  const [draftDataScope, setDraftDataScope] = useState<DataScope>("self");
  const [isPermissionsDirty, setIsPermissionsDirty] = useState(false);

  // Exemption form inside Drawer
  const [exemptionMode, setExemptionMode] = useState<"none" | "permanent" | "range">("none");
  const [exemptionCategory, setExemptionCategory] = useState<ExemptionCategory>("leave");
  const [exemptionStartDate, setExemptionStartDate] = useState(defaultDate);
  const [exemptionEndDate, setExemptionEndDate] = useState(defaultDate);
  const [exemptionReason, setExemptionReason] = useState("");

  // AI Suggestion state inside Drawer
  const [aiSuggestion, setAiSuggestion] = useState<{
    status: "normal" | "warning" | "critical";
    summary: string;
    suggestions: AiSuggestionItem[];
    loading: boolean;
    error?: string | null;
  } | null>(null);
  const [executingAiKey, setExecutingAiKey] = useState<string | null>(null);
  const [toolConfirmationModal, setToolConfirmationModal] = useState<{
    toolName: string;
    toolArgs: Record<string, unknown>;
    confirmationToken: string;
    preview?: Record<string, unknown> | null;
  } | null>(null);

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

  // Active member inside Drawer
  const activeMember = useMemo(() => {
    if (!activeMemberId) return null;
    return (
      localProfiles.find((p) => p.id === activeMemberId) ||
      localArchivedProfiles.find((p) => p.id === activeMemberId) ||
      null
    );
  }, [localProfiles, localArchivedProfiles, activeMemberId]);

  // Open Drawer & initialize state
  const openMemberDrawer = useCallback(
    (member: ProfileSummary) => {
      setActiveMemberId(member.id);
      setDraftPermissions(member.permissions ?? {});
      setDraftDataScope(member.data_scope ?? "self");
      setIsPermissionsDirty(false);
      setDrawerTab("overview");
      setAiSuggestion(null);

      // Populate exemption form
      if (member.exempt_type === "permanent") {
        setExemptionMode("permanent");
        setExemptionCategory((member.exemption_category as ExemptionCategory) ?? "waive");
        setExemptionReason(member.exempt_reason ?? "");
        setExemptionStartDate(defaultDate);
        setExemptionEndDate(defaultDate);
      } else if (member.exempt_type === "temporary") {
        setExemptionMode("range");
        setExemptionCategory((member.exemption_category as ExemptionCategory) ?? "leave");
        setExemptionReason(member.exempt_reason ?? "");
        setExemptionStartDate(member.exempt_start_date ?? defaultDate);
        setExemptionEndDate(member.exempt_end_date ?? defaultDate);
      } else {
        setExemptionMode("none");
        setExemptionCategory("leave");
        setExemptionReason("");
        setExemptionStartDate(defaultDate);
        setExemptionEndDate(defaultDate);
      }
    },
    [defaultDate]
  );

  // Focus member from URL
  const appliedFocusMemberId = useRef<string | null>(null);
  useEffect(() => {
    if (!focusMemberId) return;
    if (appliedFocusMemberId.current === focusMemberId) return;
    const member = findFocusMember(localProfiles, focusMemberId);
    if (!member) return;
    appliedFocusMemberId.current = focusMemberId;
    setSelectedTeamId(ALL_TEAMS_ID);
    setSearchQuery("");
    openMemberDrawer(member);
  }, [focusMemberId, localProfiles, openMemberDrawer]);

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

  // 3. Batch Team Transfer
  const handleBatchTransferTeam = (teamId: string) => {
    if (selectedMemberIds.length === 0) return;
    const targetTeam = localTeams.find((t) => t.id === teamId);
    const targetTeamName = targetTeam ? targetTeam.name : "未分配";
    const ids = [...selectedMemberIds];
    const prevProfiles = localProfiles;

    setLocalProfiles((prev) =>
      prev.map((p) =>
        ids.includes(p.id) ? { ...p, team_id: teamId || null, team_name: targetTeamName } : p
      )
    );
    setSelectedMemberIds([]);

    startTransition(async () => {
      let failCount = 0;
      let lastErr = "";
      for (const id of ids) {
        const res = await updateMemberTeam(id, teamId || null);
        if (res.error) {
          failCount++;
          lastErr = res.error;
        }
      }
      if (failCount > 0) {
        setLocalProfiles(prevProfiles);
        feedbackToast.warning(`部分成员调配失败 (${failCount}/${ids.length})`, { description: lastErr });
      } else {
        feedbackToast.success(`已将 ${ids.length} 位成员调配至「${targetTeamName}」`);
        router.refresh();
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
        archive_snapshot: { team_id: target.team_id, team_name: target.team_name, role: target.role },
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
            archive_snapshot: { team_id: p.team_id, team_name: p.team_name, role: p.role },
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
      feedbackToast.success(`已恢复「${target.name}」为在职普通成员`);
      router.refresh();
    });
  };

  // 6. Role Switch (member <-> admin)
  const handleToggleRole = (member: ProfileSummary) => {
    const newRole = member.role === "admin" ? "member" : "admin";
    const prevProfiles = localProfiles;
    setLocalProfiles((prev) =>
      prev.map((p) =>
        p.id === member.id
          ? { ...p, role: newRole, permissions: newRole === "member" ? {} : p.permissions }
          : p
      )
    );

    startTransition(async () => {
      const res = await changeRole(member.id, newRole);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error("变更角色失败", { description: res.error });
      } else {
        feedbackToast.success(`角色已变更为「${newRole === "admin" ? "团队主管" : "普通组员"}」`);
        router.refresh();
      }
    });
  };

  // 7. Save Permissions
  const handleSavePermissions = () => {
    if (!activeMember) return;
    startTransition(async () => {
      const res = await updatePermissions(activeMember.id, draftPermissions, draftDataScope);
      if (res.error) {
        feedbackToast.error("保存权限失败", { description: res.error });
        return;
      }
      setLocalProfiles((prev) =>
        prev.map((p) =>
          p.id === activeMember.id ? { ...p, permissions: draftPermissions, data_scope: draftDataScope } : p
        )
      );
      setIsPermissionsDirty(false);
      feedbackToast.success("权限配置已保存");
      router.refresh();
    });
  };

  // 8. Save Exemption
  const handleSaveExemption = () => {
    if (!activeMember) return;
    startTransition(async () => {
      if (exemptionMode === "none") {
        const res = await clearExemption(activeMember.id);
        if (res.error) {
          feedbackToast.error("清除豁免失败", { description: res.error });
          return;
        }
        setLocalProfiles((prev) =>
          prev.map((p) =>
            p.id === activeMember.id
              ? {
                  ...p,
                  exempt_type: null,
                  exempt_start_date: null,
                  exempt_end_date: null,
                  exempt_reason: null,
                  exemption_category: null,
                }
              : p
          )
        );
        feedbackToast.success("已清除豁免状态");
      } else {
        const formValues = {
          userId: activeMember.id,
          mode: exemptionMode,
          category: exemptionCategory,
          reason: exemptionReason.trim() || undefined,
          startDate: exemptionMode === "range" ? exemptionStartDate : undefined,
          endDate: exemptionMode === "range" ? exemptionEndDate : undefined,
          date: exemptionMode === "permanent" ? defaultDate : undefined,
        };
        const res = await updateExemption(formValues);
        if (res.error) {
          feedbackToast.error("设置豁免失败", { description: res.error });
          return;
        }
        setLocalProfiles((prev) =>
          prev.map((p) =>
            p.id === activeMember.id
              ? {
                  ...p,
                  exempt_type: exemptionMode === "permanent" ? "permanent" : "temporary",
                  exempt_start_date: exemptionMode === "range" ? exemptionStartDate : null,
                  exempt_end_date: exemptionMode === "range" ? exemptionEndDate : null,
                  exempt_reason: exemptionReason.trim() || null,
                  exemption_category: exemptionCategory,
                }
              : p
          )
        );
        feedbackToast.success(exemptionMode === "permanent" ? "已设置永久豁免" : "已设置请假/免交区间");
      }
      router.refresh();
    });
  };

  // 9. Password Reset
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
      const res = await actionFn(requestId, "通过管理员工作台一键审批");
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
        summary: payload.summary || "履约与权限状态良好。",
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

  // Select-All toggler
  const handleToggleSelectAll = () => {
    const allIds = selectableFilteredMemberIds;
    const isAllSelected = allIds.every((id) => selectedMemberIds.includes(id));
    if (isAllSelected) {
      setSelectedMemberIds((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      setSelectedMemberIds((prev) => Array.from(new Set([...prev, ...allIds])));
    }
  };

  return (
    <div className="mt-4 w-full space-y-5 relative">
      <main className="space-y-5">
        {/* ── 待审批入团申请预警栏 ── */}
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
                  {canManageMembers && (
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
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 主控制台与高密度成员列表 ── */}
        <section className="rounded-xl border border-zinc-200 bg-white">
          {/* 一体化工具栏 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-zinc-100">
            <div className="flex flex-wrap items-center gap-2">
              {/* 团队选择器 (带管辖范围隔离) */}
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
                        {truncateTeamName(t.name, 10)} ({count})
                      </option>
                    );
                  })}
                  {canManageCompany && <option value="__manage__">管理架构…</option>}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2 size-3 text-zinc-400" />
              </div>

              {/* 排序 */}
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

              {/* 搜索框 */}
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

            {/* 状态切换与计数 */}
            <div className="flex items-center gap-3">
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
                      : "text-zinc-500 hover:text-zinc-700"
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
                  }}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-md transition-colors",
                    memberView === "archived"
                      ? "bg-white text-zinc-900 shadow-sm font-medium"
                      : "text-zinc-500 hover:text-zinc-700"
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

          {/* 成员双列紧凑网格 (方案 A) */}
          {sortedProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UsersRound className="size-8 text-zinc-300 mb-3" />
              <p className="text-[13px] text-zinc-500">没有找到成员</p>
              <p className="text-[12px] text-zinc-400 mt-1">调整筛选或搜索条件试试</p>
            </div>
          ) : (
            <div className="p-3.5 grid grid-cols-1 xl:grid-cols-2 gap-2.5">
              {sortedProfiles.map((member) => {
                const isArchivedView = memberView === "archived";
                const isCurrentMemberActive = activeMemberId === member.id;
                const isRestoredFocus = restoredFocusId === member.id;
                const isChecked = selectedMemberIds.includes(member.id);
                const isCurrentlyExempt = !isArchivedView && isProfileExemptOnDate(member, defaultDate);

                const published = member.monthly_published_count ?? 0;
                const required = member.monthly_required_count ?? 0;
                const fulfillRatio = required > 0 ? Math.min(100, Math.round((published / required) * 100)) : 0;

                return (
                  <div
                    key={member.id}
                    onClick={() => openMemberDrawer(member)}
                    className={cn(
                      "group relative flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer select-none",
                      isRestoredFocus
                        ? "bg-amber-50 border-amber-300 animate-pulse"
                        : isChecked
                        ? "bg-zinc-50 border-zinc-900/40 shadow-2xs"
                        : isCurrentMemberActive
                        ? "bg-zinc-50/80 border-zinc-300 shadow-2xs"
                        : "bg-white border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50/50 hover:shadow-2xs"
                    )}
                  >
                    {/* 左侧：勾选框 + 姓名 + 身份徽标 + 邮箱（单排紧凑） */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {canManageCompany && !isArchivedView && member.id !== currentUserId && (
                        <div
                          className="shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
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

                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-zinc-900 shrink-0">
                          {member.name}
                        </span>
                        {member.id === currentUserId && (
                          <span className="text-[10px] text-zinc-400 border border-zinc-200 px-1 rounded shrink-0">
                            我
                          </span>
                        )}
                        {isCurrentlyExempt && (
                          <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded shrink-0">
                            豁免
                          </span>
                        )}
                        {member.email && (
                          <span className="text-[11px] text-zinc-400 truncate font-normal">
                            {member.email}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 右侧：角色徽标 + 团队 + 橙色履约进度条 */}
                    <div className="flex items-center gap-3 shrink-0">
                      {/* 角色徽标 */}
                      <div className="text-center shrink-0">
                        {isArchivedView ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 font-medium">
                            <Archive className="size-3" />
                            已归档
                          </span>
                        ) : member.role === "owner" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#43718E]/10 text-[#43718E]">
                            创始人
                          </span>
                        ) : member.role === "admin" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#405740]/10 text-[#405740]">
                            主管
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400">组员</span>
                        )}
                      </div>

                      {/* 团队 */}
                      <div
                        className="shrink-0 text-[11px] text-zinc-600 max-w-[84px] truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isArchivedView ? (
                          <span className="text-zinc-400">
                            {truncateTeamName(member.archive_snapshot?.team_name as string, 6)}
                          </span>
                        ) : !canEditTeamMembers || member.id === currentUserId ? (
                          <span>{truncateTeamName(member.team_name, 6)}</span>
                        ) : (
                          <div className="relative inline-flex items-center">
                            <select
                              value={member.team_id ?? ""}
                              onChange={(e) =>
                                handleTransferMemberTeam(member.id, e.target.value ? e.target.value : null)
                              }
                              className="h-6 pl-1.5 pr-4 text-[11px] bg-transparent text-zinc-600 border border-transparent hover:border-zinc-200 hover:bg-zinc-100/80 rounded outline-none cursor-pointer appearance-none transition-colors max-w-[84px] truncate"
                            >
                              <option value="">未分配</option>
                              {localTeams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {truncateTeamName(t.name, 6)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-0.5 top-1.5 size-2.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </div>

                      {/* 本月实发 / 应发进度条 */}
                      <div className="w-20 text-right shrink-0">
                        {isArchivedView ? (
                          <span className="text-[11px] text-zinc-400">
                            {member.archive_snapshot?.role === "admin" ? "主管" : "组员"}
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center justify-end gap-1 text-[11px] text-zinc-600 tabular-nums">
                              <span className="font-semibold text-zinc-900">{published}</span>
                              <span className="text-zinc-400">/</span>
                              <span>{required}条</span>
                            </div>
                            {required > 0 && (
                              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#D97757] rounded-full transition-all duration-300"
                                  style={{ width: `${fulfillRatio}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 归档视图下恢复按钮 */}
                      {isArchivedView && isCompanyOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRestoreTarget(member);
                          }}
                          disabled={isPending}
                          className="h-7 px-2 text-[11px] text-zinc-500 hover:text-zinc-700 shrink-0"
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── 3.1 底部批量操作浮动条 (跟随 v3 风格) ── */}
      {selectedMemberIds.length > 0 && (
        <aside
          aria-label="批量操作"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white/95 backdrop-blur-sm px-5 py-2.5 shadow-xl animate-in fade-in zoom-in-95"
        >
          <span className="text-[12px] font-semibold text-zinc-900 pr-3 border-r border-zinc-200">
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
                className="h-7.5 text-[11px] font-medium bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 pr-6 text-zinc-700 outline-none appearance-none cursor-pointer hover:border-zinc-300"
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
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3 text-zinc-400" />
            </div>
          )}

          {isCompanyOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBatchArchiveReason("");
                setBatchArchiveOpen(true);
              }}
              className="h-7.5 px-3 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl font-medium"
            >
              <Archive className="size-3 mr-1" />
              批量归档
            </Button>
          )}

          <button
            type="button"
            onClick={() => setSelectedMemberIds([])}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
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
            setActiveMemberId(null);
            setAiSuggestion(null);
          }
        }}
      >
        <SheetContent className="w-full max-w-xl sm:max-w-xl p-0 overflow-y-auto">
          {activeMember && (
            <div className="flex flex-col h-full">
              {/* 抽屉头部 */}
              <div className="p-6 border-b border-zinc-200/80 bg-zinc-50/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-11 rounded-full bg-zinc-200 text-zinc-800 flex items-center justify-center font-bold text-[16px] border border-zinc-300">
                      {activeMember.name ? activeMember.name.slice(0, 1) : "U"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <SheetTitle className="text-[17px] font-semibold text-zinc-950">
                          {activeMember.name || "未命名"}
                        </SheetTitle>
                        {activeMember.role === "owner" ? (
                          <Badge variant="accent">创始人</Badge>
                        ) : activeMember.role === "admin" ? (
                          <Badge variant="success">主管</Badge>
                        ) : (
                          <Badge variant="secondary">组员</Badge>
                        )}
                        {activeMember.membership_status === "archived" && (
                          <Badge variant="neutral">已归档</Badge>
                        )}
                      </div>
                      <SheetDescription className="text-[12px] text-zinc-500 mt-1 flex flex-wrap items-center gap-2">
                        <Mail className="size-3 text-zinc-400" />
                        <span>{activeMember.email || "未绑定邮箱"}</span>
                        <span>·</span>
                        <Building2 className="size-3 text-zinc-400" />
                        <span>{activeMember.team_name || "未分配团队"}</span>
                      </SheetDescription>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveMemberId(null);
                      setAiSuggestion(null);
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* 抽屉 4 大功能 Tab */}
                <div className="mt-5 flex border-b border-zinc-200">
                  <button
                    type="button"
                    onClick={() => setDrawerTab("overview")}
                    className={cn(
                      "pb-2.5 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                      drawerTab === "overview"
                        ? "border-[#D97757] text-[#D97757] font-semibold"
                        : "border-transparent text-zinc-600 hover:text-zinc-950"
                    )}
                  >
                    概览与 AI 诊断
                  </button>

                  {activeMember.membership_status !== "archived" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDrawerTab("team_role")}
                        className={cn(
                          "pb-2.5 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                          drawerTab === "team_role"
                            ? "border-[#D97757] text-[#D97757] font-semibold"
                            : "border-transparent text-zinc-600 hover:text-zinc-950"
                        )}
                      >
                        团队与角色
                      </button>

                      {permissionManagerCapabilities.canEditPermissions && (
                        <button
                          type="button"
                          onClick={() => setDrawerTab("permissions")}
                          className={cn(
                            "pb-2.5 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                            drawerTab === "permissions"
                              ? "border-[#D97757] text-[#D97757] font-semibold"
                              : "border-transparent text-zinc-600 hover:text-zinc-950"
                          )}
                        >
                          权限配置
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDrawerTab("exemption")}
                        className={cn(
                          "pb-2.5 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                          drawerTab === "exemption"
                            ? "border-[#D97757] text-[#D97757] font-semibold"
                            : "border-transparent text-zinc-600 hover:text-zinc-950"
                        )}
                      >
                        豁免与生命周期
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 抽屉内容主体 */}
              <div className="p-6 space-y-6 flex-1">
                {/* 1. 概览与 AI 诊断 */}
                {drawerTab === "overview" && (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[13px] font-semibold text-zinc-900">本月履约概况</h4>
                        <span className="text-[12px] text-zinc-500 tabular-nums">
                          实发天数：{activeMember.monthly_published_days ?? 0} 天
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                          <p className="text-[11px] text-zinc-500">本月实发作品</p>
                          <p className="text-[20px] font-semibold text-zinc-900 mt-0.5 tabular-nums">
                            {activeMember.monthly_published_count ?? 0}
                            <span className="text-[12px] font-normal text-zinc-500 ml-1">条</span>
                          </p>
                        </div>
                        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                          <p className="text-[11px] text-zinc-500">本月应发作品</p>
                          <p className="text-[20px] font-semibold text-zinc-900 mt-0.5 tabular-nums">
                            {activeMember.monthly_required_count ?? 0}
                            <span className="text-[12px] font-normal text-zinc-500 ml-1">条</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[13px] font-semibold text-zinc-900">当前豁免状态</h4>
                        {activeMember.exempt_type ? (
                          <Badge variant="accent">
                            {activeMember.exempt_type === "permanent" ? "永久豁免" : "区间豁免"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">正常履约</Badge>
                        )}
                      </div>
                      {activeMember.exempt_type ? (
                        <div className="text-[12px] text-zinc-600 bg-zinc-50 p-3 rounded-xl space-y-1 mt-2">
                          <p>
                            分类：<strong>{activeMember.exemption_category === "leave" ? "请假" : "免交"}</strong>
                          </p>
                          {activeMember.exempt_type === "temporary" && (
                            <p>
                              时间：{activeMember.exempt_start_date} 至 {activeMember.exempt_end_date}
                            </p>
                          )}
                          {activeMember.exempt_reason && <p>原因：{activeMember.exempt_reason}</p>}
                        </div>
                      ) : (
                        <p className="text-[12px] text-zinc-500 mt-1">该成员当前无特殊豁免或请假记录。</p>
                      )}
                    </div>

                    {/* AI 顾问 (支持 execute_tool 及 409 二次确认) */}
                    {activeMember.membership_status !== "archived" && activeMember.role !== "owner" && (
                      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="size-4 text-[#D97757]" />
                            <h4 className="text-[13px] font-semibold text-zinc-900">AI 成员管理顾问</h4>
                          </div>
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={aiSuggestion?.loading}
                            onClick={handleFetchAiSuggestion}
                            className="text-[12px] gap-1"
                          >
                            <RefreshCw className={cn("size-3", aiSuggestion?.loading && "animate-spin")} />
                            {aiSuggestion?.suggestions ? "重新诊断" : "生成管理诊断"}
                          </Button>
                        </div>

                        {aiSuggestion?.loading && (
                          <div className="py-6 text-center text-[12px] text-zinc-500 space-y-2">
                            <RefreshCw className="size-5 text-[#D97757] animate-spin mx-auto" />
                            <p>正在结合近期填报、播放量与异常数据生成诊断...</p>
                          </div>
                        )}

                        {aiSuggestion?.error && (
                          <div className="p-3 bg-red-50 text-red-700 rounded-xl text-[12px] flex items-center gap-2">
                            <AlertCircle className="size-4 shrink-0" />
                            <span>{aiSuggestion.error}</span>
                          </div>
                        )}

                        {aiSuggestion?.suggestions && !aiSuggestion.loading && (
                          <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  aiSuggestion.status === "critical"
                                    ? "destructive"
                                    : aiSuggestion.status === "warning"
                                    ? "warning"
                                    : "success"
                                }
                              >
                                {aiSuggestion.status === "critical"
                                  ? "需重点跟进"
                                  : aiSuggestion.status === "warning"
                                  ? "建议关注"
                                  : "状态正常"}
                              </Badge>
                              <p className="text-[13px] font-medium text-zinc-800">{aiSuggestion.summary}</p>
                            </div>

                            {aiSuggestion.suggestions.length > 0 && (
                              <div className="space-y-2 mt-2">
                                {aiSuggestion.suggestions.map((s, idx) => {
                                  const key = `${s.label}-${idx}`;
                                  const isBusy = executingAiKey === key;
                                  return (
                                    <div
                                      key={idx}
                                      className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-start justify-between gap-2"
                                    >
                                      <div className="text-[12px] space-y-0.5">
                                        <p className="font-semibold text-zinc-900">{s.label}</p>
                                        <p className="text-zinc-500">{s.description}</p>
                                      </div>
                                      <div className="shrink-0 flex items-center gap-1">
                                        {s.action.type === "navigate" && (
                                          <Button
                                            variant="ghost"
                                            size="xs"
                                            onClick={() => {
                                              if ("href" in s.action) router.push(s.action.href);
                                            }}
                                            className="text-[#D97757] text-[11px]"
                                          >
                                            前往 <ArrowRight className="size-3 ml-0.5" />
                                          </Button>
                                        )}
                                        {s.action.type === "execute_tool" && (
                                          <Button
                                            variant="default"
                                            size="xs"
                                            disabled={isBusy}
                                            onClick={() => handleExecuteAiSuggestion(s, key)}
                                            className="bg-[#D97757] hover:bg-[#C96442] text-[11px] gap-1"
                                          >
                                            <Play className="size-3 fill-current" />
                                            {isBusy ? "执行中..." : "一键执行"}
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {!aiSuggestion && (
                          <p className="text-[12px] text-zinc-500">
                            点击右上角按钮，AI 将综合分析该成员的填报周期、异常断流及表现提出运营建议。
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. 团队与角色管理 (包含 3.2 独立移出团队) */}
                {drawerTab === "team_role" && (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3">
                      <div>
                        <h4 className="text-[13px] font-semibold text-zinc-900">所属团队调配</h4>
                        <p className="text-[12px] text-zinc-500 mt-0.5">调整该成员归属团队或移出当前团队</p>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Select
                          value={activeMember.team_id || "__unassigned__"}
                          disabled={!canEditTeamMembers}
                          onValueChange={(val) => {
                            if (val) {
                              const newId = val === "__unassigned__" ? null : val;
                              handleTransferMemberTeam(activeMember.id, newId);
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择所属团队" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned__">未分配团队（移出）</SelectItem>
                            {localTeams.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {canEditTeamMembers && activeMember.team_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleTransferMemberTeam(activeMember.id, null)}
                            className="text-zinc-600 hover:text-red-600 shrink-0 text-[12px]"
                            title="移出当前团队（保留账号与数据）"
                          >
                            <UserMinus className="size-3.5 mr-1 text-red-500" />
                            移出
                          </Button>
                        )}
                      </div>
                    </div>

                    {canManageMembers && activeMember.role !== "owner" && (
                      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3">
                        <div>
                          <h4 className="text-[13px] font-semibold text-zinc-900">系统角色变更</h4>
                          <p className="text-[12px] text-zinc-500 mt-0.5">
                            主管可负责本团队日常管理；变更为组员将清空自定义权限
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (activeMember.role !== "member") handleToggleRole(activeMember);
                            }}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-colors",
                              activeMember.role === "member"
                                ? "border-zinc-900 bg-zinc-50 font-medium"
                                : "border-zinc-200 bg-white hover:bg-zinc-50"
                            )}
                          >
                            <p className="text-[13px] font-semibold text-zinc-900">普通组员</p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">仅查看和提交个人数据</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (activeMember.role !== "admin") handleToggleRole(activeMember);
                            }}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-colors",
                              activeMember.role === "admin"
                                ? "border-zinc-900 bg-zinc-50 font-medium"
                                : "border-zinc-200 bg-white hover:bg-zinc-50"
                            )}
                          >
                            <p className="text-[13px] font-semibold text-zinc-900">团队主管</p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">负责本团队日常业务与审批</p>
                          </button>
                        </div>
                      </div>
                    )}

                    {canManageMembers && (
                      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-[13px] font-semibold text-zinc-900">重置登录密码</h4>
                          <p className="text-[12px] text-zinc-500 mt-0.5">为成员重置一个临时的登录密码</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPasswordResetTarget(activeMember);
                            setNewPassword("");
                          }}
                        >
                          <KeyRound className="size-3.5 mr-1" />
                          重置密码
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. 细粒度权限配置 (标准 MemberPermissionEditor) */}
                {drawerTab === "permissions" && (
                  <div className="space-y-6">
                    <MemberPermissionEditor
                      member={{
                        id: activeMember.id,
                        name: activeMember.name ?? "",
                        email: activeMember.email,
                        last_sign_in_at: activeMember.last_sign_in_at,
                        role: activeMember.role,
                        teamId: activeMember.team_id,
                        teamName: activeMember.team_name,
                        permissions: activeMember.permissions ?? {},
                        data_scope: activeMember.data_scope,
                        status: normalizeUserStatus(activeMember.status),
                        exempt_type: (activeMember.exempt_type as "permanent" | "temporary") || null,
                        exempt_start_date: activeMember.exempt_start_date,
                        exempt_end_date: activeMember.exempt_end_date,
                        exempt_reason: activeMember.exempt_reason,
                        exemption_category: (activeMember.exemption_category as ExemptionCategory) || null,
                      }}
                      draftPermissions={draftPermissions}
                      draftDataScope={draftDataScope}
                      onTogglePermission={(key: PermissionKey, checked: boolean) => {
                        setDraftPermissions((prev) => ({ ...prev, [key]: checked }));
                        setIsPermissionsDirty(true);
                      }}
                      onToggleCategory={(category: PermissionCategory) => {
                        const keys = PERMISSION_CATEGORIES[category];
                        const isAllChecked = keys.every((k) => draftPermissions[k] === true);
                        setDraftPermissions((prev) => {
                          const next = { ...prev };
                          keys.forEach((k) => {
                            next[k] = !isAllChecked;
                          });
                          return next;
                        });
                        setIsPermissionsDirty(true);
                      }}
                      onToggleAllPermissions={() => {
                        const isAllChecked = PERMISSION_KEYS.every((k) => draftPermissions[k] === true);
                        setDraftPermissions((prev) => {
                          const next = { ...prev };
                          PERMISSION_KEYS.forEach((k) => {
                            next[k] = !isAllChecked;
                          });
                          return next;
                        });
                        setIsPermissionsDirty(true);
                      }}
                      onChangeDataScope={(scope: DataScope) => {
                        setDraftDataScope(scope);
                        setIsPermissionsDirty(true);
                      }}
                      canEdit={permissionManagerCapabilities.canEditPermissions && activeMember.role !== "owner"}
                      isSaving={isPending}
                    />

                    {permissionManagerCapabilities.canEditPermissions && activeMember.role !== "owner" && (
                      <div className="pt-2">
                        <Button
                          variant="default"
                          disabled={!isPermissionsDirty || isPending}
                          onClick={handleSavePermissions}
                          className="w-full bg-[#D97757] hover:bg-[#C96442]"
                        >
                          {isPending ? "保存中..." : "保存权限设置"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. 豁免与账号生命周期 */}
                {drawerTab === "exemption" && (
                  <div className="space-y-6">
                    {canManageFulfillment && (
                      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-4">
                        <div>
                          <h4 className="text-[13px] font-semibold text-zinc-900">豁免与请假规则配置</h4>
                          <p className="text-[12px] text-zinc-500 mt-0.5">
                            设置成员免发或请假区间，避免系统产生催发与缺发预警
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 bg-zinc-100/80 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setExemptionMode("none")}
                            className={cn(
                              "py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                              exemptionMode === "none"
                                ? "bg-white text-zinc-950 shadow-2xs font-semibold"
                                : "text-zinc-600 hover:text-zinc-950"
                            )}
                          >
                            正常（无豁免）
                          </button>
                          <button
                            type="button"
                            onClick={() => setExemptionMode("range")}
                            className={cn(
                              "py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                              exemptionMode === "range"
                                ? "bg-white text-zinc-950 shadow-2xs font-semibold"
                                : "text-zinc-600 hover:text-zinc-950"
                            )}
                          >
                            区间请假/免交
                          </button>
                          <button
                            type="button"
                            onClick={() => setExemptionMode("permanent")}
                            className={cn(
                              "py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                              exemptionMode === "permanent"
                                ? "bg-white text-zinc-950 shadow-2xs font-semibold"
                                : "text-zinc-600 hover:text-zinc-950"
                            )}
                          >
                            永久豁免
                          </button>
                        </div>

                        {exemptionMode !== "none" && (
                          <div className="space-y-3 pt-2">
                            <div>
                              <label className="text-[12px] font-medium text-zinc-700 block mb-1">
                                豁免性质
                              </label>
                              <div className="flex gap-4">
                                <label className="flex items-center gap-1.5 text-[12px] text-zinc-700 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="exemptionCategory"
                                    checked={exemptionCategory === "leave"}
                                    onChange={() => setExemptionCategory("leave")}
                                    className="text-[#D97757]"
                                  />
                                  <span>请假</span>
                                </label>
                                <label className="flex items-center gap-1.5 text-[12px] text-zinc-700 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="exemptionCategory"
                                    checked={exemptionCategory === "waive"}
                                    onChange={() => setExemptionCategory("waive")}
                                    className="text-[#D97757]"
                                  />
                                  <span>免交</span>
                                </label>
                              </div>
                            </div>

                            {exemptionMode === "range" && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[11px] text-zinc-500 block mb-1">开始日期</label>
                                  <Input
                                    type="date"
                                    value={exemptionStartDate}
                                    onChange={(e) => setExemptionStartDate(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] text-zinc-500 block mb-1">结束日期</label>
                                  <Input
                                    type="date"
                                    value={exemptionEndDate}
                                    onChange={(e) => setExemptionEndDate(e.target.value)}
                                  />
                                </div>
                              </div>
                            )}

                            <div>
                              <label className="text-[11px] text-zinc-500 block mb-1">豁免原因说明</label>
                              <Input
                                type="text"
                                placeholder="例如：事假、外出培训、设备调试"
                                value={exemptionReason}
                                onChange={(e) => setExemptionReason(e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        <Button
                          variant="default"
                          disabled={isPending}
                          onClick={handleSaveExemption}
                          className="w-full bg-[#D97757] hover:bg-[#C96442]"
                        >
                          {isPending ? "保存中..." : "保存豁免状态"}
                        </Button>
                      </div>
                    )}

                    {/* 危险区：归档账号 */}
                    {isCompanyOwner && activeMember.role !== "owner" && (
                      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 space-y-3">
                        <div>
                          <h4 className="text-[13px] font-semibold text-red-950">危险区域：账号归档</h4>
                          <p className="text-[12px] text-red-700 mt-0.5">
                            归档将立即封禁该账号的 Auth 登录权限并移出团队，历史日报与数据将完整保留供追溯。
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setArchiveTarget(activeMember);
                            setArchiveReason("");
                          }}
                          className="w-full bg-[#C9604D] hover:bg-[#C9604D]/90"
                        >
                          归档该账号
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Dialogs ── */}

      {/* 3.4 团队架构管理弹窗 (支持删除空团队与新建) */}
      <Dialog open={teamManagementDialogOpen} onOpenChange={setTeamManagementDialogOpen}>
        <DialogContent className="max-w-[460px] p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold text-zinc-950">团队架构管理</DialogTitle>
            <DialogDescription className="text-[12px] text-zinc-500">
              新建团队或维护现有团队架构
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {canManageCompany && (
              <div className="space-y-1.5">
                <Label htmlFor="v3-team-name" className="text-[12px] font-medium text-zinc-700">
                  新建团队
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="v3-team-name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="例如：深圳一部、杭州运营组"
                    className="h-8.5 text-[12px] rounded-xl"
                  />
                  <Button
                    onClick={handleCreateTeam}
                    disabled={isPending || !newTeamName.trim()}
                    className="h-8.5 px-3.5 bg-zinc-900 text-white hover:bg-zinc-800 rounded-xl text-[12px] shrink-0"
                  >
                    <Plus className="size-3.5 mr-1" />
                    创建
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[260px] overflow-y-auto pt-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                现有团队 ({localTeams.length})
              </span>
              {localTeams.length === 0 ? (
                <p className="text-[12px] text-zinc-400 py-3 text-center">暂无团队记录</p>
              ) : (
                localTeams.map((team) => {
                  const count = localProfiles.filter((p) => p.team_id === team.id).length;
                  return (
                    <div
                      key={team.id}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-zinc-200/70 bg-zinc-50/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="size-3.5 text-zinc-400 shrink-0" />
                        <span className="text-[13px] font-medium text-zinc-800 truncate">{team.name}</span>
                        <span className="text-[11px] text-zinc-500 bg-white px-2 py-0.5 rounded-full border border-zinc-200/50 tabular-nums">
                          {count} 人
                        </span>
                      </div>
                      {canManageCompany && count === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTeamTarget(team)}
                          className="h-7 px-2 text-[11px] text-zinc-400 hover:text-red-600 rounded-lg shrink-0"
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
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTeamManagementDialogOpen(false)}
              className="h-8.5 text-[12px] rounded-xl"
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认归档成员账号</DialogTitle>
            <DialogDescription>
              即将归档「{archiveTarget?.name}」的账号。归档将立即封禁登录并移出团队，历史日报不受影响。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-1.5">
            <label className="text-[12px] font-medium text-zinc-700 block">
              归档原因说明 <span className="text-red-500">*</span>
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
            <DialogTitle>批量归档成员账号</DialogTitle>
            <DialogDescription>
              即将批量归档选中的 {selectedMemberIds.length} 位成员账号，归档后将封禁登录并移出各自团队。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-1.5">
            <label className="text-[12px] font-medium text-zinc-700 block">
              统一归档原因说明 <span className="text-red-500">*</span>
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
          restoreTarget ? `确认恢复 ${restoreTarget.name}？恢复后将解除封禁，成为未分配团队的在职普通成员。` : ""
        }
        confirmText="确认恢复"
        loading={isPending}
        onConfirm={handleRestoreMember}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
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
            <DialogTitle>重置登录密码</DialogTitle>
            <DialogDescription>
              为「{passwordResetTarget?.name}」设置新的临时登录密码（至少 6 位）。
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-1.5">
            <label className="text-[12px] font-medium text-zinc-700 block">新密码</label>
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
              className="bg-[#D97757] hover:bg-[#C96442]"
            >
              {isPending ? "重置中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 工具执行二次确认弹窗 (2.2 支持 execute_tool 409 二次确认) */}
      <Dialog
        open={Boolean(toolConfirmationModal)}
        onOpenChange={(open) => !open && setToolConfirmationModal(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-5 text-[#D97757]" />
              确认执行 AI 管理建议动作
            </DialogTitle>
            <DialogDescription>
              该操作属于敏感管理动作（{toolConfirmationModal?.toolName}），请确认预估变更后继续。
            </DialogDescription>
          </DialogHeader>

          {toolConfirmationModal?.preview && (
            <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200/60 text-[12px] space-y-1 text-zinc-700 max-h-48 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-sans">
                {JSON.stringify(toolConfirmationModal.preview, null, 2)}
              </pre>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setToolConfirmationModal(null)}>
              取消
            </Button>
            <Button
              variant="default"
              disabled={isPending}
              onClick={() => {
                if (toolConfirmationModal) {
                  const fakeSuggestion: AiSuggestionItem = {
                    label: "确认执行",
                    description: "",
                    action: {
                      type: "execute_tool",
                      toolName: toolConfirmationModal.toolName,
                      toolArgs: toolConfirmationModal.toolArgs,
                    },
                  };
                  handleExecuteAiSuggestion(
                    fakeSuggestion,
                    "confirmed",
                    toolConfirmationModal.confirmationToken
                  );
                }
              }}
              className="bg-[#D97757] hover:bg-[#C96442]"
            >
              {isPending ? "执行中..." : "确认执行"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
