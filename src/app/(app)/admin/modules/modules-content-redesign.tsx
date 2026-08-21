"use client";

import { useState, useTransition, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Building2,
  Search,
  Plus,
  Trash2,
  KeyRound,
  UserX,
  UserMinus,
  Sparkles,
  Mail,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  UserPlus,
  RefreshCw,
  X,
  AlertCircle,
  Play,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberPermissionEditor } from "@/app/(app)/admin/components/member-permission-editor";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

import type {
  AdminModulesTeamManagementData,
} from "@/lib/loaders/admin-modules";
import type {
  AdminModuleMemberSummary,
} from "@/lib/admin-modules-contract";
import type { AdminRequestRow } from "@/lib/team-join/service";
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
  PERMISSION_CATEGORIES,
  PERMISSION_KEYS,
} from "@/types";

import {
  updateMemberTeam,
  changeRole,
  updatePermissions,
  updateExemption,
  clearExemption,
  resetMemberPassword,
  archiveMember,
  restoreMember,
  createTeam,
  deleteTeam,
} from "@/app/(app)/admin/actions";
import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "@/app/(app)/admin/join-request-actions";
import type { PermissionManagerCapabilities } from "@/app/(app)/admin/权限管理";
import {
  ALL_TEAMS_ID,
  formatLastLoginDisplay,
  getArchivedTeamName,
  getVisibleTeamOptions,
  isProfileExemptOnDate,
  resolveDefaultSelectedTeamId,
  type TeamFilterId,
} from "./team-view-logic";

export interface AdminModulesContentRedesignProps {
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserBusinessRole: UserRole;
  currentUserCompanyRole?: CompanyRole;
  currentUserGroupMode?: boolean;
  currentUserPermissions: Permissions;
  permissionManagerCapabilities: PermissionManagerCapabilities;
  allProfiles: AdminModuleMemberSummary[];
  archivedProfiles?: AdminModuleMemberSummary[];
  teams: Array<{ id: string; name: string }>;
  teamManagement: AdminModulesTeamManagementData;
  pendingRequests: AdminRequestRow[];
  defaultDate: string;
  focusMemberId?: string;
}

type MainTab = "active" | "archived" | "requests";

interface AiSuggestionState {
  loading: boolean;
  data: {
    status: "normal" | "warning" | "critical";
    summary: string;
    suggestions: Array<{
      label: string;
      description: string;
      action:
        | { type: "execute_tool"; toolName: string; toolArgs?: Record<string, unknown> }
        | { type: "navigate"; href: string };
    }>;
    generatedAt: string;
  } | null;
  error: string | null;
}

interface ToolConfirmationModalState {
  toolName: string;
  toolArgs: Record<string, unknown>;
  confirmationToken: string;
  preview?: Record<string, unknown> | null;
}

export function AdminModulesContentRedesign({
  currentUserId,
  currentUserRole,
  currentUserBusinessRole,
  currentUserCompanyRole,
  currentUserGroupMode = false,
  currentUserPermissions,
  permissionManagerCapabilities,
  allProfiles: initialAllProfiles,
  archivedProfiles: initialArchivedProfiles = [],
  teams: initialTeams,
  teamManagement,
  pendingRequests: initialPendingRequests,
  defaultDate,
  focusMemberId,
}: AdminModulesContentRedesignProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local state initialized with server props
  const [activeProfiles, setActiveProfiles] = useState<AdminModuleMemberSummary[]>(initialAllProfiles);
  const [archivedProfiles, setArchivedProfiles] = useState<AdminModuleMemberSummary[]>(initialArchivedProfiles);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>(initialTeams);
  const [pendingRequests, setPendingRequests] = useState<AdminRequestRow[]>(initialPendingRequests);

  // Sync state when props change
  useEffect(() => {
    setActiveProfiles(initialAllProfiles);
  }, [initialAllProfiles]);

  useEffect(() => {
    setArchivedProfiles(initialArchivedProfiles);
  }, [initialArchivedProfiles]);

  useEffect(() => {
    setTeams(initialTeams);
  }, [initialTeams]);

  useEffect(() => {
    setPendingRequests(initialPendingRequests);
  }, [initialPendingRequests]);

  // Permission & scope summary
  const isOwner =
    currentUserBusinessRole === "owner" ||
    currentUserCompanyRole === "company_owner" ||
    currentUserRole === "owner";
  const isCompanyOwner = currentUserCompanyRole === "company_owner" || isOwner;
  const canManageCompany = isCompanyOwner || currentUserGroupMode;
  const canManageMembers = canManageCompany || currentUserPermissions.manage_members === true;
  const canManageFulfillment = canManageCompany || currentUserPermissions.manage_fulfillment === true;
  const canEditTeamMembers = teamManagement.access.canEditMembers || canManageMembers;

  // Compute strictly visible teams according to user data access scope and role
  const visibleTeamOptions = useMemo(() => {
    return getVisibleTeamOptions({
      isOwner,
      groupMode: currentUserGroupMode,
      allTeams: teams,
      manageableTeams: teamManagement.teams,
    });
  }, [isOwner, currentUserGroupMode, teams, teamManagement.teams]);

  // View state
  const [currentTab, setCurrentTab] = useState<MainTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<TeamFilterId>(() =>
    resolveDefaultSelectedTeamId({
      currentUserId,
      profiles: initialAllProfiles,
      visibleTeams: visibleTeamOptions,
      isOwner,
      groupMode: currentUserGroupMode,
    })
  );

  // Multi-selection state for batch actions
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Inspector Drawer state
  const [selectedMember, setSelectedMember] = useState<AdminModuleMemberSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"overview" | "team_role" | "permissions" | "exemption">("overview");

  // Draft Permissions state in Drawer
  const [draftPermissions, setDraftPermissions] = useState<Permissions>({});
  const [draftDataScope, setDraftDataScope] = useState<DataScope>("self");
  const [isPermissionsDirty, setIsPermissionsDirty] = useState(false);

  // AI Suggestion state in Drawer
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestionState>({
    loading: false,
    data: null,
    error: null,
  });

  // Tool execution secondary confirmation state
  const [toolConfirmationModal, setToolConfirmationModal] = useState<ToolConfirmationModalState | null>(null);

  // Modal dialog states
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const [deleteTeamDialogOpen, setDeleteTeamDialogOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<{ id: string; name: string } | null>(null);

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [memberToArchive, setMemberToArchive] = useState<AdminModuleMemberSummary | null>(null);

  const [batchArchiveDialogOpen, setBatchArchiveDialogOpen] = useState(false);
  const [batchArchiveReason, setBatchArchiveReason] = useState("");

  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [memberToResetPassword, setMemberToResetPassword] = useState<AdminModuleMemberSummary | null>(null);

  const [batchTransferDialogOpen, setBatchTransferDialogOpen] = useState(false);
  const [batchTargetTeamId, setBatchTargetTeamId] = useState<string>("");

  // Exemption form state in Drawer
  const [exemptionMode, setExemptionMode] = useState<"none" | "permanent" | "range">("none");
  const [exemptionCategory, setExemptionCategory] = useState<ExemptionCategory>("leave");
  const [exemptionStartDate, setExemptionStartDate] = useState(defaultDate);
  const [exemptionEndDate, setExemptionEndDate] = useState(defaultDate);
  const [exemptionReason, setExemptionReason] = useState("");

  // Open drawer and initialize draft state
  const openMemberDrawer = useCallback((member: AdminModuleMemberSummary) => {
    setSelectedMember(member);
    setDraftPermissions(member.permissions ?? {});
    setDraftDataScope(member.data_scope ?? "self");
    setIsPermissionsDirty(false);
    setDrawerTab("overview");
    setAiSuggestion({ loading: false, data: null, error: null });

    // Populate exemption state
    if (member.exempt_type === "permanent") {
      setExemptionMode("permanent");
      setExemptionCategory(member.exemption_category ?? "waive");
      setExemptionReason(member.exempt_reason ?? "");
      setExemptionStartDate(defaultDate);
      setExemptionEndDate(defaultDate);
    } else if (member.exempt_type === "temporary") {
      setExemptionMode("range");
      setExemptionCategory(member.exemption_category ?? "leave");
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

    setDrawerOpen(true);
  }, [defaultDate]);

  // Handle focusMemberId on load
  useEffect(() => {
    if (focusMemberId) {
      const target =
        activeProfiles.find((p) => p.id === focusMemberId) ||
        archivedProfiles.find((p) => p.id === focusMemberId);
      if (target) {
        openMemberDrawer(target);
      }
    }
  }, [focusMemberId, activeProfiles, archivedProfiles, openMemberDrawer]);

  // Background refresh of emails and last login
  const refreshMemberEmails = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/modules/member-emails", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.emails && typeof data.emails === "object") {
        setActiveProfiles((prev) =>
          prev.map((p) => {
            const emailInfo = data.emails[p.id];
            if (emailInfo) {
              return { ...p, email: emailInfo };
            }
            return p;
          })
        );
      }
    } catch {
      // Background non-blocking failure
    }
  }, []);

  useEffect(() => {
    refreshMemberEmails();
  }, [refreshMemberEmails]);

  // Filter profiles
  const visibleActiveProfiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return activeProfiles.filter((p) => {
      if (selectedTeamId !== ALL_TEAMS_ID && p.team_id !== selectedTeamId) {
        return false;
      }
      if (!query) return true;
      return (
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.email && p.email.toLowerCase().includes(query)) ||
        (p.team_name && p.team_name.toLowerCase().includes(query))
      );
    });
  }, [activeProfiles, selectedTeamId, searchQuery]);

  const visibleArchivedProfiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return archivedProfiles.filter((p) => {
      const teamId =
        (p.archive_snapshot && typeof p.archive_snapshot.team_id === "string"
          ? p.archive_snapshot.team_id
          : null) ?? p.team_id ?? null;
      if (selectedTeamId !== ALL_TEAMS_ID && teamId !== selectedTeamId) {
        return false;
      }
      if (!query) return true;
      const teamName = getArchivedTeamName(p);
      return (
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.email && p.email.toLowerCase().includes(query)) ||
        (teamName && teamName.toLowerCase().includes(query)) ||
        (p.archive_reason && p.archive_reason.toLowerCase().includes(query))
      );
    });
  }, [archivedProfiles, selectedTeamId, searchQuery]);

  // Selectable member IDs for batch action on current screen
  const currentScreenSelectableIds = useMemo(() => {
    return visibleActiveProfiles
      .filter((p) => p.id !== currentUserId)
      .map((p) => p.id);
  }, [visibleActiveProfiles, currentUserId]);

  const isAllSelected =
    currentScreenSelectableIds.length > 0 &&
    currentScreenSelectableIds.every((id) => selectedMemberIds.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMemberIds((prev) =>
        prev.filter((id) => !currentScreenSelectableIds.includes(id))
      );
    } else {
      setSelectedMemberIds((prev) =>
        Array.from(new Set([...prev, ...currentScreenSelectableIds]))
      );
    }
  };

  const handleToggleSelectMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // --- ACTIONS ---

  // 1. Team Management: Create Team
  const handleCreateTeam = async () => {
    const trimmed = newTeamName.trim();
    if (!trimmed) {
      feedbackToast.warning("请输入团队名称");
      return;
    }

    startTransition(async () => {
      const res = await createTeam(trimmed);
      if (res.error) {
        feedbackToast.error("创建团队失败", { description: res.error });
        return;
      }

      if (res.team) {
        setTeams((prev) => [...prev, res.team!]);
        setSelectedTeamId(res.team.id);
      }
      setCreateTeamDialogOpen(false);
      setNewTeamName("");
      feedbackToast.success("团队创建成功", { description: `已新增团队「${trimmed}」` });
      router.refresh();
    });
  };

  // 2. Team Management: Delete Team
  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;

    startTransition(async () => {
      const res = await deleteTeam(teamToDelete.id);
      if (res.error) {
        feedbackToast.error("删除团队失败", { description: res.error });
        return;
      }

      setTeams((prev) => prev.filter((t) => t.id !== teamToDelete.id));
      if (selectedTeamId === teamToDelete.id) {
        setSelectedTeamId(ALL_TEAMS_ID);
      }
      setDeleteTeamDialogOpen(false);
      setTeamToDelete(null);
      feedbackToast.success("团队已删除");
      router.refresh();
    });
  };

  // 3. Member Team Transfer (Single)
  const handleTransferMember = async (targetId: string, newTeamId: string | null) => {
    startTransition(async () => {
      const res = await updateMemberTeam(targetId, newTeamId);
      if (res.error) {
        feedbackToast.error("调配团队失败", { description: res.error });
        return;
      }

      const teamObj = teams.find((t) => t.id === newTeamId);
      const teamName = teamObj ? teamObj.name : null;

      setActiveProfiles((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, team_id: newTeamId, team_name: teamName } : p))
      );

      if (selectedMember && selectedMember.id === targetId) {
        setSelectedMember((prev: AdminModuleMemberSummary | null) => (prev ? { ...prev, team_id: newTeamId, team_name: teamName } : null));
      }

      feedbackToast.success(newTeamId ? `已调配至 ${teamName}` : "已从团队移出");
      router.refresh();
    });
  };

  // 4. Batch Team Transfer
  const handleBatchTransfer = async () => {
    if (selectedMemberIds.length === 0) return;
    const targetTeamId = batchTargetTeamId === "__unassigned__" ? null : batchTargetTeamId;

    startTransition(async () => {
      let successCount = 0;
      let lastError = "";

      for (const id of selectedMemberIds) {
        const res = await updateMemberTeam(id, targetTeamId);
        if (res.error) {
          lastError = res.error;
        } else {
          successCount++;
        }
      }

      const targetTeamName = targetTeamId ? teams.find((t) => t.id === targetTeamId)?.name : "未分配";
      setActiveProfiles((prev) =>
        prev.map((p) =>
          selectedMemberIds.includes(p.id)
            ? { ...p, team_id: targetTeamId, team_name: targetTeamName ?? null }
            : p
        )
      );

      setSelectedMemberIds([]);
      setBatchTransferDialogOpen(false);

      if (successCount === selectedMemberIds.length) {
        feedbackToast.success(`成功调配 ${successCount} 位成员至「${targetTeamName}」`);
      } else {
        feedbackToast.warning(`部分调配完成：成功 ${successCount} 位，失败 ${selectedMemberIds.length - successCount} 位`, {
          description: lastError,
        });
      }
      router.refresh();
    });
  };

  // 5. Change Role (member <-> admin)
  const handleChangeRole = async (targetId: string, newRole: "member" | "admin") => {
    startTransition(async () => {
      const res = await changeRole(targetId, newRole);
      if (res.error) {
        feedbackToast.error("修改角色失败", { description: res.error });
        return;
      }

      setActiveProfiles((prev) =>
        prev.map((p) =>
          p.id === targetId
            ? {
                ...p,
                role: newRole,
                permissions: newRole === "member" ? {} : p.permissions,
              }
            : p
        )
      );

      if (selectedMember && selectedMember.id === targetId) {
        setSelectedMember((prev: AdminModuleMemberSummary | null) =>
          prev
            ? {
                ...prev,
                role: newRole,
                permissions: newRole === "member" ? {} : prev.permissions,
              }
            : null
        );
        if (newRole === "member") {
          setDraftPermissions({});
        }
      }

      feedbackToast.success(`角色已变更为「${newRole === "admin" ? "主管" : "组员"}」`);
      router.refresh();
    });
  };

  // 6. Update Permissions & Data Scope
  const handleSavePermissions = async () => {
    if (!selectedMember) return;

    startTransition(async () => {
      const res = await updatePermissions(selectedMember.id, draftPermissions, draftDataScope);
      if (res.error) {
        feedbackToast.error("权限更新失败", { description: res.error });
        return;
      }

      setActiveProfiles((prev) =>
        prev.map((p) =>
          p.id === selectedMember.id
            ? { ...p, permissions: draftPermissions, data_scope: draftDataScope }
            : p
        )
      );
      setSelectedMember((prev: AdminModuleMemberSummary | null) =>
        prev ? { ...prev, permissions: draftPermissions, data_scope: draftDataScope } : null
      );
      setIsPermissionsDirty(false);

      feedbackToast.success("权限配置已保存");
      router.refresh();
    });
  };

  // 7. Exemption: Set Exemption
  const handleSaveExemption = async () => {
    if (!selectedMember) return;

    startTransition(async () => {
      if (exemptionMode === "none") {
        const res = await clearExemption(selectedMember.id);
        if (res.error) {
          feedbackToast.error("清除豁免失败", { description: res.error });
          return;
        }

        setActiveProfiles((prev) =>
          prev.map((p) =>
            p.id === selectedMember.id
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
        setSelectedMember((prev: AdminModuleMemberSummary | null) =>
          prev
            ? {
                ...prev,
                exempt_type: null,
                exempt_start_date: null,
                exempt_end_date: null,
                exempt_reason: null,
                exemption_category: null,
              }
            : null
        );
        feedbackToast.success("已清除豁免状态");
      } else {
        const formValues = {
          userId: selectedMember.id,
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

        setActiveProfiles((prev) =>
          prev.map((p) =>
            p.id === selectedMember.id
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
        setSelectedMember((prev: AdminModuleMemberSummary | null) =>
          prev
            ? {
                ...prev,
                exempt_type: exemptionMode === "permanent" ? "permanent" : "temporary",
                exempt_start_date: exemptionMode === "range" ? exemptionStartDate : null,
                exempt_end_date: exemptionMode === "range" ? exemptionEndDate : null,
                exempt_reason: exemptionReason.trim() || null,
                exemption_category: exemptionCategory,
              }
            : null
        );
        feedbackToast.success(exemptionMode === "permanent" ? "已设置永久豁免" : "已设置请假/免交区间");
      }

      router.refresh();
    });
  };

  // 8. Reset Password
  const handleResetPassword = async () => {
    if (!memberToResetPassword) return;
    const pwd = newPassword.trim();
    if (pwd.length < 6) {
      feedbackToast.warning("密码长度不能少于 6 位");
      return;
    }

    startTransition(async () => {
      const res = await resetMemberPassword(memberToResetPassword.id, pwd);
      if (res.error) {
        feedbackToast.error("重置密码失败", { description: res.error });
        return;
      }

      setResetPasswordDialogOpen(false);
      setNewPassword("");
      setMemberToResetPassword(null);
      feedbackToast.success("密码重置成功", { description: `已为 ${memberToResetPassword.name} 重置登录密码` });
    });
  };

  // 9. Single Archive Member (Owner only)
  const handleArchiveMember = async () => {
    if (!memberToArchive) return;
    const reason = archiveReason.trim();
    if (!reason) {
      feedbackToast.warning("必须填写归档原因");
      return;
    }

    startTransition(async () => {
      const res = await archiveMember(memberToArchive.id, reason);
      if (res.error) {
        feedbackToast.error("归档失败", { description: res.error });
        return;
      }

      const archivedItem: AdminModuleMemberSummary = {
        ...memberToArchive,
        membership_status: "archived",
        archived_at: new Date().toISOString(),
        archive_reason: reason,
        archive_snapshot: {
          team_id: memberToArchive.team_id,
          team_name: memberToArchive.team_name,
          role: memberToArchive.role,
        },
        team_id: null,
        team_name: null,
      };

      setActiveProfiles((prev) => prev.filter((p) => p.id !== memberToArchive.id));
      setArchivedProfiles((prev) => [archivedItem, ...prev]);

      setArchiveDialogOpen(false);
      setArchiveReason("");
      setMemberToArchive(null);
      if (selectedMember?.id === memberToArchive.id) {
        setDrawerOpen(false);
        setSelectedMember(null);
      }

      feedbackToast.success(`成员「${memberToArchive.name}」已归档并封禁登录`);
      router.refresh();
    });
  };

  // 10. Batch Archive Members (Owner only)
  const handleBatchArchive = async () => {
    if (selectedMemberIds.length === 0) return;
    const reason = batchArchiveReason.trim();
    if (!reason) {
      feedbackToast.warning("必须填写批量归档原因");
      return;
    }

    startTransition(async () => {
      let successCount = 0;
      let lastError = "";
      const successfullyArchivedIds: string[] = [];

      for (const id of selectedMemberIds) {
        const res = await archiveMember(id, reason);
        if (res.error) {
          lastError = res.error;
        } else {
          successCount++;
          successfullyArchivedIds.push(id);
        }
      }

      if (successfullyArchivedIds.length > 0) {
        const newlyArchived = activeProfiles
          .filter((p) => successfullyArchivedIds.includes(p.id))
          .map((p) => ({
            ...p,
            membership_status: "archived" as const,
            archived_at: new Date().toISOString(),
            archive_reason: reason,
            archive_snapshot: { team_id: p.team_id, team_name: p.team_name, role: p.role },
            team_id: null,
            team_name: null,
          }));

        setActiveProfiles((prev) => prev.filter((p) => !successfullyArchivedIds.includes(p.id)));
        setArchivedProfiles((prev) => [...newlyArchived, ...prev]);
      }

      setSelectedMemberIds([]);
      setBatchArchiveDialogOpen(false);
      setBatchArchiveReason("");

      if (successCount === selectedMemberIds.length) {
        feedbackToast.success(`成功批量归档 ${successCount} 位成员账号`);
      } else {
        feedbackToast.warning(`部分归档完成：成功 ${successCount} 位，失败 ${selectedMemberIds.length - successCount} 位`, {
          description: lastError,
        });
      }
      router.refresh();
    });
  };

  // 11. Restore Member (Owner only)
  const handleRestoreMember = async (targetId: string) => {
    startTransition(async () => {
      const res = await restoreMember(targetId);
      if (res.error) {
        feedbackToast.error("恢复账号失败", { description: res.error });
        return;
      }

      const restoredTarget = archivedProfiles.find((p) => p.id === targetId);
      if (restoredTarget) {
        const activeItem: AdminModuleMemberSummary = {
          ...restoredTarget,
          membership_status: "active",
          role: "member",
          permissions: {},
          team_id: null,
          team_name: null,
          archived_at: null,
          archived_by: null,
          archive_reason: null,
          archive_snapshot: null,
        };

        setArchivedProfiles((prev) => prev.filter((p) => p.id !== targetId));
        setActiveProfiles((prev) => [...prev, activeItem]);
      }

      if (selectedMember?.id === targetId) {
        setDrawerOpen(false);
        setSelectedMember(null);
      }

      feedbackToast.success("账号已恢复为在职普通成员（无团队，空权限）");
      router.refresh();
    });
  };

  // 12. Review Join Requests
  const handleReviewRequest = async (requestId: string, action: "approve" | "reject") => {
    startTransition(async () => {
      const fn = action === "approve" ? approveJoinRequestAction : rejectJoinRequestAction;
      const res = await fn(requestId, null);

      if (!res.ok) {
        feedbackToast.error(action === "approve" ? "审批通过失败" : "驳回申请失败", {
          description: res.error,
        });
        return;
      }

      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      feedbackToast.success(action === "approve" ? "已批准入团申请" : "已驳回入团申请");
      router.refresh();
    });
  };

  // 13. AI Suggestion Loader
  const loadAiSuggestion = async (memberId: string) => {
    setAiSuggestion({ loading: true, data: null, error: null });
    try {
      const res = await fetch("/api/admin/member-ai-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAiSuggestion({
          loading: false,
          data: null,
          error: err.error || "生成建议失败",
        });
        return;
      }

      const data = await res.json();
      setAiSuggestion({
        loading: false,
        data,
        error: null,
      });
    } catch {
      setAiSuggestion({
        loading: false,
        data: null,
        error: "网络异常，无法获取 AI 建议",
      });
    }
  };

  // 14. Execute AI Tool Action
  const handleExecuteTool = async (
    toolName: string,
    toolArgs: Record<string, unknown> = {},
    confirmationToken?: string
  ) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/execute-tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolName, toolArgs, confirmationToken }),
        });

        if (res.status === 409) {
          const payload = await res.json();
          setToolConfirmationModal({
            toolName,
            toolArgs,
            confirmationToken: payload.confirmationToken,
            preview: payload.result?.preview ?? null,
          });
          return;
        }

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          feedbackToast.error("执行失败", { description: payload.error || "工具执行出错" });
          return;
        }

        feedbackToast.success("工具执行成功");
        setToolConfirmationModal(null);
        router.refresh();
      } catch {
        feedbackToast.error("网络异常，无法执行工具");
      }
    });
  };

  return (
    <div className="w-full space-y-6">
      {/* 顶部状态与全域概览条 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/70 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* 三大主视图切换：在职 / 归档 / 审批 */}
          <div className="inline-flex rounded-xl bg-zinc-100/80 p-1 border border-zinc-200/50">
            <button
              type="button"
              onClick={() => setCurrentTab("active")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                currentTab === "active"
                  ? "bg-white text-zinc-950 shadow-xs font-semibold"
                  : "text-zinc-600 hover:text-zinc-950"
              )}
            >
              <Users className="size-3.5" />
              <span>在职成员</span>
              <span className="ml-1 text-[11px] text-zinc-500 tabular-nums">
                ({activeProfiles.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab("archived")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                currentTab === "archived"
                  ? "bg-white text-zinc-950 shadow-xs font-semibold"
                  : "text-zinc-600 hover:text-zinc-950"
              )}
            >
              <UserX className="size-3.5" />
              <span>归档账号</span>
              <span className="ml-1 text-[11px] text-zinc-500 tabular-nums">
                ({archivedProfiles.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab("requests")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors relative",
                currentTab === "requests"
                  ? "bg-white text-zinc-950 shadow-xs font-semibold"
                  : "text-zinc-600 hover:text-zinc-950"
              )}
            >
              <UserPlus className="size-3.5" />
              <span>入团申请</span>
              {pendingRequests.length > 0 && (
                <span className="size-2 rounded-full bg-[#D97757] animate-pulse" />
              )}
              <span className="ml-1 text-[11px] text-zinc-500 tabular-nums">
                ({pendingRequests.length})
              </span>
            </button>
          </div>

          {/* 集团模式位置徽标 */}
          {currentUserGroupMode && (
            <Badge
              variant="default"
              className="bg-[#43718E]/10 text-[#43718E] border border-[#43718E]/20"
            >
              <Building2 className="size-3 mr-1" />
              集团全域模式
            </Badge>
          )}
        </div>

        {/* 右侧快速操作：新建团队 */}
        {canManageMembers && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateTeamDialogOpen(true)}
              className="text-[13px] gap-1.5"
            >
              <Plus className="size-3.5 text-[#D97757]" />
              新建团队
            </Button>
          </div>
        )}
      </div>

      {/* 当处于在职或归档视图时，渲染控制台与成员网格 */}
      {currentTab !== "requests" && (
        <div className="space-y-4">
          {/* 去框平铺微气垫控制栏 */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-zinc-50/80 p-2.5 rounded-2xl border border-zinc-200/60">
            {/* 团队胶囊切换区 (严格受限于可见团队 visibleTeamOptions) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTeamId(ALL_TEAMS_ID)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[13px] transition-colors duration-150",
                  selectedTeamId === ALL_TEAMS_ID
                    ? "bg-zinc-900 text-white font-medium shadow-xs"
                    : "bg-white border border-zinc-200/70 text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60"
                )}
              >
                全部团队
                <span className="ml-1 text-[11px] opacity-70 tabular-nums">
                  {currentTab === "active" ? activeProfiles.length : archivedProfiles.length}
                </span>
              </button>

              {visibleTeamOptions.map((team) => {
                const isSelected = selectedTeamId === team.id;
                const memberCount =
                  currentTab === "active"
                    ? activeProfiles.filter((p) => p.team_id === team.id).length
                    : archivedProfiles.filter((p) => {
                        const archivedTeamId =
                          (p.archive_snapshot && typeof p.archive_snapshot.team_id === "string"
                            ? p.archive_snapshot.team_id
                            : null) ?? p.team_id ?? null;
                        return archivedTeamId === team.id;
                      }).length;

                return (
                  <div key={team.id} className="relative group/team-pill flex items-center">
                    <button
                      type="button"
                      onClick={() => setSelectedTeamId(team.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-[13px] transition-colors duration-150 flex items-center gap-1",
                        isSelected
                          ? "bg-zinc-900 text-white font-medium shadow-xs"
                          : "bg-white border border-zinc-200/70 text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60"
                      )}
                    >
                      <span>{team.name}</span>
                      <span className="text-[11px] opacity-70 tabular-nums">({memberCount})</span>
                    </button>

                    {/* 删除空团队入口（仅对空团队且有权限者开放） */}
                    {canManageMembers && memberCount === 0 && (
                      <button
                        type="button"
                        title="删除无成员团队"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTeamToDelete(team);
                          setDeleteTeamDialogOpen(true);
                        }}
                        className="ml-1 p-1 text-zinc-400 hover:text-[#C9604D] rounded-md transition-colors"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 搜索与过滤 */}
            <div className="flex items-center gap-2 min-w-[240px] max-w-sm w-full">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400 pointer-events-none" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索姓名 / 邮箱 / 团队..."
                  className="pl-8 bg-white border-zinc-200/80 h-8.5 rounded-xl text-[13px]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 批量操作工具栏（当在职成员且有勾选时呈现） */}
          {currentTab === "active" && canManageMembers && (
            <div className="flex items-center justify-between px-1 text-[12px] text-zinc-600">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleToggleSelectAll}
                  />
                  <span>全选本页（{currentScreenSelectableIds.length} 人）</span>
                </label>

                {selectedMemberIds.length > 0 && (
                  <div className="flex items-center gap-2 bg-zinc-900 text-white px-3 py-1.5 rounded-xl shadow-sm animate-in fade-in zoom-in-95">
                    <span>已选择 {selectedMemberIds.length} 人</span>
                    <button
                      type="button"
                      onClick={() => setBatchTransferDialogOpen(true)}
                      className="ml-2 text-[#D97757] hover:underline font-medium"
                    >
                      批量调配团队
                    </button>

                    {isCompanyOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          setBatchArchiveReason("");
                          setBatchArchiveDialogOpen(true);
                        }}
                        className="ml-2 text-red-400 hover:text-red-300 font-medium"
                      >
                        批量归档
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedMemberIds([])}
                      className="ml-2 text-zinc-400 hover:text-white"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 成员全景网格 */}
          {currentTab === "active" ? (
            visibleActiveProfiles.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-zinc-200/60 bg-white p-8">
                <Users className="size-8 text-zinc-300 mx-auto mb-3 stroke-[1.5]" />
                <p className="text-[14px] font-medium text-zinc-800">未找到符合条件的在职成员</p>
                <p className="text-[12px] text-zinc-500 mt-1">可以尝试清空搜索条件或切换团队筛选</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {visibleActiveProfiles.map((member) => {
                  const isSelected = selectedMemberIds.includes(member.id);
                  const isCurrent = member.id === currentUserId;
                  const isExempt = isProfileExemptOnDate(member, defaultDate);
                  const { text: loginText, isLoginStale } = formatLastLoginDisplay(member.last_sign_in_at);

                  const published = member.monthly_published_count ?? 0;
                  const required = member.monthly_required_count ?? 0;
                  const fulfillRatio = required > 0 ? Math.min(100, Math.round((published / required) * 100)) : 0;

                  return (
                    <div
                      key={member.id}
                      onClick={() => openMemberDrawer(member)}
                      className={cn(
                        "group/card relative flex flex-col justify-between rounded-2xl border bg-white p-4 transition-all duration-150 cursor-pointer select-none",
                        isSelected
                          ? "border-[#D97757] ring-1 ring-[#D97757]/20 shadow-sm"
                          : "border-zinc-200/80 hover:border-zinc-300 hover:shadow-xs"
                      )}
                    >
                      {/* 卡片头部：勾选框 + 头像 + 姓名 + 角色 */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {canManageMembers && !isCurrent && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSelectMember(member.id);
                                }}
                                className="shrink-0"
                              >
                                <Checkbox checked={isSelected} />
                              </div>
                            )}

                            {/* 纯色头像首字母 */}
                            <div className="size-8 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center font-semibold text-[13px] shrink-0 border border-zinc-200/60">
                              {member.name ? member.name.slice(0, 1) : "U"}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[14px] font-semibold text-zinc-950 truncate">
                                  {member.name || "未命名用户"}
                                </span>
                                {isCurrent && (
                                  <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.2 rounded font-normal">
                                    我
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-zinc-500 truncate mt-0.5" title={member.email || undefined}>
                                {member.email || "未绑定邮箱"}
                              </p>
                            </div>
                          </div>

                          {/* 角色徽标 */}
                          <div className="shrink-0">
                            {member.role === "owner" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#43718E]/10 text-[#43718E] border border-[#43718E]/20">
                                创始人
                              </span>
                            ) : member.role === "admin" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#405740]/10 text-[#405740] border border-[#405740]/20">
                                主管
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600">
                                组员
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 团队归属与豁免状态 */}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 bg-zinc-50 border border-zinc-200/60 px-2 py-0.5 rounded-md">
                            <Building2 className="size-3 text-zinc-400" />
                            {member.team_name || "未分配团队"}
                          </span>

                          {isExempt && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#43718E] bg-[#43718E]/10 px-2 py-0.5 rounded-md">
                              {member.exempt_type === "permanent"
                                ? "永久豁免"
                                : member.exemption_category === "leave"
                                ? "请假中"
                                : "免交"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 卡片下部：履约指标条 + 登录时间 */}
                      <div className="mt-4 pt-3 border-t border-zinc-100 space-y-2">
                        {/* 本月实发与应发 */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500">本月实发 / 应发</span>
                            <span className="font-medium text-zinc-800 tabular-nums">
                              {published} / {required} 条
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#D97757] rounded-full transition-all duration-300"
                              style={{ width: `${fulfillRatio}%` }}
                            />
                          </div>
                        </div>

                        {/* 登录时间 */}
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span
                            className={cn(
                              "truncate",
                              isLoginStale && "text-[#D99E55]"
                            )}
                            title={loginText}
                          >
                            {loginText}
                          </span>
                          <ChevronRight className="size-3 text-zinc-300 group-hover/card:text-zinc-600 group-hover/card:translate-x-0.5 transition-all shrink-0" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* 归档账号网格 */
            visibleArchivedProfiles.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-zinc-200/60 bg-white p-8">
                <UserX className="size-8 text-zinc-300 mx-auto mb-3 stroke-[1.5]" />
                <p className="text-[14px] font-medium text-zinc-800">暂无已归档账号记录</p>
                <p className="text-[12px] text-zinc-500 mt-1">归档后的账号会在此处保留审计历史与快照</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {visibleArchivedProfiles.map((member) => {
                  const teamName = getArchivedTeamName(member) || "无原团队";

                  return (
                    <div
                      key={member.id}
                      onClick={() => openMemberDrawer(member)}
                      className="group/archived relative flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 transition-all hover:bg-white hover:border-zinc-300 hover:shadow-xs cursor-pointer select-none"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="size-8 rounded-full bg-zinc-200/70 text-zinc-500 flex items-center justify-center font-semibold text-[13px] shrink-0">
                              {member.name ? member.name.slice(0, 1) : "U"}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[14px] font-medium text-zinc-700 truncate block">
                                {member.name}
                              </span>
                              <p className="text-[12px] text-zinc-400 truncate mt-0.5">
                                {member.email || "未绑定邮箱"}
                              </p>
                            </div>
                          </div>

                          <Badge variant="neutral" className="shrink-0 text-[11px]">
                            已归档
                          </Badge>
                        </div>

                        {/* 原团队与归档原因 */}
                        <div className="mt-3 space-y-1.5 text-[12px]">
                          <div className="flex items-center gap-1 text-zinc-500">
                            <Building2 className="size-3 text-zinc-400" />
                            <span>原团队：{teamName}</span>
                          </div>
                          {member.archive_reason && (
                            <p className="text-zinc-600 bg-white/80 p-2 rounded-lg border border-zinc-200/50 text-[12px] line-clamp-2">
                              原因：{member.archive_reason}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 底部操作：恢复账号 */}
                      <div className="mt-4 pt-3 border-t border-zinc-200/50 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400">
                          归档于 {member.archived_at ? member.archived_at.slice(0, 10) : "历史"}
                        </span>

                        {isCompanyOwner && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestoreMember(member.id);
                            }}
                            className="text-[12px] text-[#D97757] hover:text-[#C96442]"
                          >
                            恢复账号
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* 入团申请审批面板 */}
      {currentTab === "requests" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[16px] font-semibold text-zinc-900">入团申请审核</h3>
              <p className="text-[12px] text-zinc-500 mt-0.5">
                新注册成员申请加入对应团队时，需主管或公司所有者审批放行
              </p>
            </div>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-zinc-200/60 bg-white p-8">
              <CheckCircle2 className="size-8 text-[#6FAA7D] mx-auto mb-3 stroke-[1.5]" />
              <p className="text-[14px] font-medium text-zinc-800">所有入团申请均已处理完成</p>
              <p className="text-[12px] text-zinc-500 mt-1">当前暂无待审批的新成员入团请求</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-4 shadow-xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-[#D97757]/10 text-[#D97757] flex items-center justify-center font-bold text-[14px]">
                        {req.applicantName ? req.applicantName.slice(0, 1) : "申"}
                      </div>
                      <div>
                        <h4 className="text-[14px] font-semibold text-zinc-950">
                          {req.applicantName}
                        </h4>
                        <p className="text-[12px] text-zinc-500 mt-0.5">{req.applicantEmail || "未提供邮箱"}</p>
                      </div>
                    </div>

                    <Badge variant="warning" className="text-[11px]">
                      待审批
                    </Badge>
                  </div>

                  <div className="rounded-xl bg-zinc-50 p-3 text-[12px] text-zinc-600 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="size-3.5 text-zinc-400" />
                      <span>申请加入：<strong className="text-zinc-900">{req.targetTeamName}</strong></span>
                    </div>
                    <span className="text-zinc-400 text-[11px]">
                      {req.createdAt ? req.createdAt.slice(0, 10) : ""}
                    </span>
                  </div>

                  {canManageMembers && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReviewRequest(req.id, "reject")}
                        className="text-zinc-500 hover:text-[#C9604D]"
                      >
                        驳回
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleReviewRequest(req.id, "approve")}
                        className="bg-[#D97757] hover:bg-[#C96442]"
                      >
                        批准加入
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- 右侧全功能工作台抽屉 (Member Inspector Sheet) --- */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full max-w-xl sm:max-w-xl p-0 overflow-y-auto">
          {selectedMember && (
            <div className="flex flex-col h-full">
              {/* 抽屉头部 */}
              <div className="p-6 border-b border-zinc-200/80 bg-zinc-50/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-full bg-zinc-200 text-zinc-800 flex items-center justify-center font-bold text-[18px] border border-zinc-300">
                      {selectedMember.name ? selectedMember.name.slice(0, 1) : "U"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <SheetTitle className="text-[18px] font-semibold text-zinc-950">
                          {selectedMember.name || "未命名"}
                        </SheetTitle>
                        {selectedMember.role === "owner" ? (
                          <Badge variant="accent">创始人</Badge>
                        ) : selectedMember.role === "admin" ? (
                          <Badge variant="success">主管</Badge>
                        ) : (
                          <Badge variant="secondary">组员</Badge>
                        )}
                        {selectedMember.membership_status === "archived" && (
                          <Badge variant="neutral">已归档</Badge>
                        )}
                      </div>
                      <SheetDescription className="text-[12px] text-zinc-500 mt-1 flex items-center gap-2">
                        <Mail className="size-3 text-zinc-400" />
                        <span>{selectedMember.email || "未绑定邮箱"}</span>
                        <span>·</span>
                        <Building2 className="size-3 text-zinc-400" />
                        <span>{selectedMember.team_name || "未分配团队"}</span>
                      </SheetDescription>
                    </div>
                  </div>
                </div>

                {/* 抽屉导航 Tabs */}
                <div className="mt-6 flex border-b border-zinc-200">
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

                  {selectedMember.membership_status !== "archived" && (
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

              {/* 抽屉内容区 */}
              <div className="p-6 space-y-6 flex-1">
                {/* 1. 概览与 AI 诊断 */}
                {drawerTab === "overview" && (
                  <div className="space-y-6">
                    {/* 本月实发表单统计 */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[13px] font-semibold text-zinc-900">本月履约概况</h4>
                        <span className="text-[12px] text-zinc-500 tabular-nums">
                          实发天数：{selectedMember.monthly_published_days ?? 0} 天
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                          <p className="text-[11px] text-zinc-500">本月实发作品</p>
                          <p className="text-[20px] font-semibold text-zinc-900 mt-0.5 tabular-nums">
                            {selectedMember.monthly_published_count ?? 0}
                            <span className="text-[12px] font-normal text-zinc-500 ml-1">条</span>
                          </p>
                        </div>
                        <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                          <p className="text-[11px] text-zinc-500">本月应发作品</p>
                          <p className="text-[20px] font-semibold text-zinc-900 mt-0.5 tabular-nums">
                            {selectedMember.monthly_required_count ?? 0}
                            <span className="text-[12px] font-normal text-zinc-500 ml-1">条</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 豁免状态概览 */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[13px] font-semibold text-zinc-900">当前豁免状态</h4>
                        {selectedMember.exempt_type ? (
                          <Badge variant="accent">
                            {selectedMember.exempt_type === "permanent" ? "永久豁免" : "区间豁免"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">正常履约</Badge>
                        )}
                      </div>

                      {selectedMember.exempt_type ? (
                        <div className="text-[12px] text-zinc-600 bg-zinc-50 p-3 rounded-xl space-y-1 mt-2">
                          <p>分类：<strong>{selectedMember.exemption_category === "leave" ? "请假" : "免交"}</strong></p>
                          {selectedMember.exempt_type === "temporary" && (
                            <p>时间：{selectedMember.exempt_start_date} 至 {selectedMember.exempt_end_date}</p>
                          )}
                          {selectedMember.exempt_reason && <p>原因：{selectedMember.exempt_reason}</p>}
                        </div>
                      ) : (
                        <p className="text-[12px] text-zinc-500 mt-1">该成员当前无特殊豁免或请假记录。</p>
                      )}
                    </div>

                    {/* AI 管理顾问 */}
                    {selectedMember.membership_status !== "archived" && selectedMember.role !== "owner" && (
                      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="size-4 text-[#D97757]" />
                            <h4 className="text-[13px] font-semibold text-zinc-900">AI 成员管理顾问</h4>
                          </div>

                          <Button
                            variant="outline"
                            size="xs"
                            disabled={aiSuggestion.loading}
                            onClick={() => loadAiSuggestion(selectedMember.id)}
                            className="text-[12px] gap-1"
                          >
                            <RefreshCw className={cn("size-3", aiSuggestion.loading && "animate-spin")} />
                            {aiSuggestion.data ? "重新诊断" : "生成管理诊断"}
                          </Button>
                        </div>

                        {aiSuggestion.loading && (
                          <div className="py-6 text-center text-[12px] text-zinc-500 space-y-2">
                            <RefreshCw className="size-5 text-[#D97757] animate-spin mx-auto" />
                            <p>正在结合近期填报、播放量与异常数据生成诊断...</p>
                          </div>
                        )}

                        {aiSuggestion.error && (
                          <div className="p-3 bg-red-50 text-red-700 rounded-xl text-[12px] flex items-center gap-2">
                            <AlertCircle className="size-4 shrink-0" />
                            <span>{aiSuggestion.error}</span>
                          </div>
                        )}

                        {aiSuggestion.data && (
                          <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  aiSuggestion.data.status === "critical"
                                    ? "destructive"
                                    : aiSuggestion.data.status === "warning"
                                    ? "warning"
                                    : "success"
                                }
                              >
                                {aiSuggestion.data.status === "critical"
                                  ? "需重点跟进"
                                  : aiSuggestion.data.status === "warning"
                                  ? "建议关注"
                                  : "状态正常"}
                              </Badge>
                              <p className="text-[13px] font-medium text-zinc-800">
                                {aiSuggestion.data.summary}
                              </p>
                            </div>

                            {aiSuggestion.data.suggestions.length > 0 && (
                              <div className="space-y-2 mt-2">
                                {aiSuggestion.data.suggestions.map((s, idx) => (
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
                                            if ("href" in s.action) {
                                              router.push(s.action.href);
                                            }
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
                                          disabled={isPending}
                                          onClick={() => {
                                            if ("toolName" in s.action) {
                                              handleExecuteTool(s.action.toolName, s.action.toolArgs);
                                            }
                                          }}
                                          className="bg-[#D97757] hover:bg-[#C96442] text-[11px] gap-1"
                                        >
                                          <Play className="size-3 fill-current" />
                                          一键执行
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {!aiSuggestion.loading && !aiSuggestion.data && !aiSuggestion.error && (
                          <p className="text-[12px] text-zinc-500">
                            点击上方按钮，AI 将综合分析该成员的填报周期、异常断流及表现提出运营建议。
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. 团队与角色管理 */}
                {drawerTab === "team_role" && (
                  <div className="space-y-6">
                    {/* 调配团队 */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3">
                      <div>
                        <h4 className="text-[13px] font-semibold text-zinc-900">所属团队调配</h4>
                        <p className="text-[12px] text-zinc-500 mt-0.5">调整该成员归属团队或移出当前团队</p>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Select
                          value={selectedMember.team_id || "__unassigned__"}
                          disabled={!canEditTeamMembers}
                          onValueChange={(val) => {
                            if (val) {
                              const newId = val === "__unassigned__" ? null : val;
                              handleTransferMember(selectedMember.id, newId);
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择所属团队" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned__">未分配团队（移出）</SelectItem>
                            {visibleTeamOptions.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {canEditTeamMembers && selectedMember.team_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleTransferMember(selectedMember.id, null)}
                            className="text-zinc-600 hover:text-[#C9604D] shrink-0 text-[12px]"
                            title="移出当前团队（保留账号与数据）"
                          >
                            <UserMinus className="size-3.5 mr-1 text-[#C9604D]" />
                            移出
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 角色调整 */}
                    {canManageMembers && selectedMember.role !== "owner" && (
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
                            onClick={() => handleChangeRole(selectedMember.id, "member")}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-colors",
                              selectedMember.role === "member"
                                ? "border-zinc-900 bg-zinc-50 font-medium"
                                : "border-zinc-200 bg-white hover:bg-zinc-50"
                            )}
                          >
                            <p className="text-[13px] font-semibold text-zinc-900">普通组员</p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">仅查看和提交个人数据</p>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleChangeRole(selectedMember.id, "admin")}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-colors",
                              selectedMember.role === "admin"
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

                    {/* 密码重置 */}
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
                            setMemberToResetPassword(selectedMember);
                            setNewPassword("");
                            setResetPasswordDialogOpen(true);
                          }}
                        >
                          <KeyRound className="size-3.5 mr-1" />
                          重置密码
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. 细粒度权限配置 (直接复用成熟标准组件 MemberPermissionEditor) */}
                {drawerTab === "permissions" && (
                  <div className="space-y-6">
                    <MemberPermissionEditor
                      member={{
                        id: selectedMember.id,
                        name: selectedMember.name ?? "",
                        email: selectedMember.email,
                        last_sign_in_at: selectedMember.last_sign_in_at,
                        role: selectedMember.role,
                        teamId: selectedMember.team_id,
                        teamName: selectedMember.team_name,
                        permissions: selectedMember.permissions ?? {},
                        data_scope: selectedMember.data_scope,
                        status: selectedMember.status as UserStatus,
                        exempt_type: selectedMember.exempt_type,
                        exempt_start_date: selectedMember.exempt_start_date,
                        exempt_end_date: selectedMember.exempt_end_date,
                        exempt_reason: selectedMember.exempt_reason,
                        exemption_category: selectedMember.exemption_category,
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
                      canEdit={permissionManagerCapabilities.canEditPermissions && selectedMember.role !== "owner"}
                      isSaving={isPending}
                    />

                    {/* 权限保存按钮 */}
                    {permissionManagerCapabilities.canEditPermissions && selectedMember.role !== "owner" && (
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
                    {/* 豁免设置 */}
                    {canManageFulfillment && (
                      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-4">
                        <div>
                          <h4 className="text-[13px] font-semibold text-zinc-900">豁免与请假规则配置</h4>
                          <p className="text-[12px] text-zinc-500 mt-0.5">
                            设置成员免发或请假区间，避免系统产生催发与缺发预警
                          </p>
                        </div>

                        {/* 豁免模式选择 */}
                        <div className="grid grid-cols-3 gap-2 bg-zinc-100/80 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setExemptionMode("none")}
                            className={cn(
                              "py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                              exemptionMode === "none"
                                ? "bg-white text-zinc-950 shadow-xs font-semibold"
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
                                ? "bg-white text-zinc-950 shadow-xs font-semibold"
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
                                ? "bg-white text-zinc-950 shadow-xs font-semibold"
                                : "text-zinc-600 hover:text-zinc-950"
                            )}
                          >
                            永久豁免
                          </button>
                        </div>

                        {exemptionMode !== "none" && (
                          <div className="space-y-3 pt-2">
                            {/* 分类 */}
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

                            {/* 日期范围 */}
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

                            {/* 原因 */}
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
                    {isCompanyOwner && selectedMember.role !== "owner" && (
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
                            setMemberToArchive(selectedMember);
                            setArchiveReason("");
                            setArchiveDialogOpen(true);
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

      {/* --- 模态弹窗区 --- */}

      {/* 1. 新建团队弹窗 */}
      <Dialog open={createTeamDialogOpen} onOpenChange={setCreateTeamDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建团队</DialogTitle>
            <DialogDescription>
              团队是成员业务与数据分析的管理边界。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <label className="text-[12px] font-medium text-zinc-700 block mb-1.5">团队名称</label>
            <Input
              placeholder="例如：深圳一部、杭州运营组"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateTeam();
              }}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTeamDialogOpen(false)}>
              取消
            </Button>
            <Button variant="default" disabled={isPending} onClick={handleCreateTeam} className="bg-[#D97757] hover:bg-[#C96442]">
              {isPending ? "创建中..." : "确认创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. 删除团队确认弹窗 */}
      <Dialog open={deleteTeamDialogOpen} onOpenChange={setDeleteTeamDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除团队</DialogTitle>
            <DialogDescription>
              确定要删除团队「{teamToDelete?.name}」吗？仅当团队内无任何成员时允许删除。
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTeamDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={handleDeleteTeam}>
              {isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. 单账号归档弹窗 */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认归档成员账号</DialogTitle>
            <DialogDescription>
              即将归档「{memberToArchive?.name}」的账号。归档将立即封禁登录并移出团队，历史日报不受影响。
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
            <Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" disabled={isPending || !archiveReason.trim()} onClick={handleArchiveMember}>
              {isPending ? "处理中..." : "确认归档"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. 批量归档弹窗 */}
      <Dialog open={batchArchiveDialogOpen} onOpenChange={setBatchArchiveDialogOpen}>
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
            <Button variant="outline" onClick={() => setBatchArchiveDialogOpen(false)}>
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

      {/* 5. 重置密码弹窗 */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重置登录密码</DialogTitle>
            <DialogDescription>
              为「{memberToResetPassword?.name}」设置新的临时登录密码（至少 6 位字符）。
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
            <Button variant="outline" onClick={() => setResetPasswordDialogOpen(false)}>
              取消
            </Button>
            <Button variant="default" disabled={isPending || newPassword.trim().length < 6} onClick={handleResetPassword} className="bg-[#D97757] hover:bg-[#C96442]">
              {isPending ? "重置中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. 批量调配团队弹窗 */}
      <Dialog open={batchTransferDialogOpen} onOpenChange={setBatchTransferDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量调配团队</DialogTitle>
            <DialogDescription>
              将选中的 {selectedMemberIds.length} 位成员批量调配至目标团队。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-1.5">
            <label className="text-[12px] font-medium text-zinc-700 block">目标团队</label>
            <Select value={batchTargetTeamId} onValueChange={(val) => val && setBatchTargetTeamId(val)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择目标团队" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">未分配团队（移出）</SelectItem>
                {visibleTeamOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchTransferDialogOpen(false)}>
              取消
            </Button>
            <Button variant="default" disabled={isPending || !batchTargetTeamId} onClick={handleBatchTransfer} className="bg-[#D97757] hover:bg-[#C96442]">
              {isPending ? "处理中..." : "确认批量调配"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. AI 工具执行二次确认弹窗 */}
      <Dialog open={Boolean(toolConfirmationModal)} onOpenChange={(open) => !open && setToolConfirmationModal(null)}>
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
                  handleExecuteTool(
                    toolConfirmationModal.toolName,
                    toolConfirmationModal.toolArgs,
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
