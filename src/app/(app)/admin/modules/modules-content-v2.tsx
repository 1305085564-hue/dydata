"use client";

import { useState, useEffect, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  UsersRound, Plus, Trash2, ShieldAlert, Sparkles, X,
  Search, KeyRound, Settings, RefreshCw, Archive, RotateCcw
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
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
  createGroup,
  assignMembersToGroup, 
  removeMemberFromGroup 
} from "../actions";

import { 
  approveJoinRequestAction, 
  rejectJoinRequestAction 
} from "../join-request-actions";

import { ExemptionDialog } from "../豁免弹窗";
import { findFocusMember } from "@/lib/admin/find-focus-member";

import type { BusinessRole } from "@/lib/business-role";
import type { ExemptionCategory, PermissionKey, Permissions, UserRole, UserStatus } from "@/types";
import type { ExemptionType } from "@/lib/豁免";
import { 
  ADMIN_PERMISSION_KEYS, 
  AI_PERMISSION_KEYS, 
  PERMISSION_LABELS, 
  PERMISSION_DESCRIPTIONS 
} from "@/types";

interface ProfileSummary {
  id: string;
  name: string;
  email: string | null;
  role: string;
  team_id?: string | null;
  group_id?: string | null;
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
}

interface TeamOption {
  id: string;
  name: string;
}

interface GroupOption {
  id: string;
  name: string;
  team_id: string | null;
  leader_user_id: string | null;
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

interface TeamV2ContentProps {
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserBusinessRole?: BusinessRole;
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
      canEditGroups: boolean;
      teamIds: string[] | null;
      groupIds: string[] | null;
    };
    teams: TeamOption[];
    groups: GroupOption[];
    profiles: unknown[];
    leaderCandidates: unknown[];
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

function normalizeUserStatus(value: string | null | undefined): UserStatus {
  return value === "exempt" ? "exempt" : "active";
}

function normalizeExemptionType(value: string | null | undefined): ExemptionType | null {
  return value === "permanent" || value === "temporary" ? value : null;
}

function normalizeExemptionCategory(value: string | null | undefined): ExemptionCategory | null {
  return value === "waive" || value === "leave" ? value : null;
}

export function AdminModulesContentV2({
  currentUserId,
  currentUserRole,
  currentUserBusinessRole,
  permissionManagerCapabilities,
  allProfiles,
  archivedProfiles: initialArchivedProfiles = [],
  teams: initialTeams,
  teamManagement,
  pendingRequests: initialPendingRequests,
  focusMemberId,
}: TeamV2ContentProps) {
  const router = useRouter();
  const [localTeams, setLocalTeams] = useState<TeamOption[]>(initialTeams);
  const [localProfiles, setLocalProfiles] = useState<ProfileSummary[]>(allProfiles);
  const [localArchivedProfiles, setLocalArchivedProfiles] = useState<ProfileSummary[]>(initialArchivedProfiles);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(initialPendingRequests);
  const [memberView, setMemberView] = useState<"active" | "archived">("active");

  const [selectedTeamId, setSelectedTeamId] = useState<string>("__all__");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  
  const [newTeamName, setNewTeamName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupLeaderId, setNewGroupLeaderId] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [passwordResetTarget, setPasswordResetTarget] = useState<ProfileSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [removeTarget, setRemoveTarget] = useState<ProfileSummary | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProfileSummary | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<ProfileSummary | null>(null);
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<TeamOption | null>(null);
  
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Permissions>({});
  const [exemptionMemberId, setExemptionMemberId] = useState<string | null>(null);
  
  const [aiSuggestion, setAiSuggestion] = useState<{
    status: "normal" | "warning" | "critical";
    summary: string;
    suggestions: AiSuggestion[];
    loading: boolean;
  } | null>(null);
  const [executingAiKey, setExecutingAiKey] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [isSavingPermissions, startSavingPermissions] = useTransition();

  useEffect(() => {
    setLocalProfiles(allProfiles);
    setLocalArchivedProfiles(initialArchivedProfiles);
  }, [allProfiles, initialArchivedProfiles]);

  const hasFetchedEmails = useRef(false);
  useEffect(() => {
    if (hasFetchedEmails.current) return;
    hasFetchedEmails.current = true;
    let active = true;

    async function fetchEmails() {
      try {
        const response = await fetch("/api/admin/modules/member-emails", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.emails && active) {
          setLocalProfiles(prev =>
            prev.map(p => ({
              ...p,
              email: payload.emails[p.id] ?? p.email
            }))
          );
        }
      } catch {
      }
    }
    void fetchEmails();
    return () => { active = false; };
  }, []);

  const appliedFocusMemberId = useRef<string | null>(null);
  useEffect(() => {
    if (!focusMemberId) return;
    if (appliedFocusMemberId.current === focusMemberId) return;
    const member = findFocusMember(localProfiles, focusMemberId);
    if (!member) return;
    appliedFocusMemberId.current = focusMemberId;
    setSelectedTeamId("__all__");
    setSelectedGroupId(null);
    setSearchQuery("");
    setActiveMemberId(member.id);
    setDraftPermissions({ ...member.permissions });
  }, [focusMemberId, localProfiles]);

  const filteredProfiles = useMemo(() => {
    const source = memberView === "archived" ? localArchivedProfiles : localProfiles;
    return source.filter(p => {
      if (memberView === "archived") {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase().trim();
        return [p.name, p.email || "", p.archive_reason || ""].some((value) =>
          value.toLowerCase().includes(query),
        );
      }
      if (selectedTeamId !== "__all__") {
        if (p.team_id !== selectedTeamId) return false;
      }
      if (selectedGroupId === "__direct__") {
        if (p.group_id) return false;
      } else if (selectedGroupId) {
        if (p.group_id !== selectedGroupId) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = (p.name || "").toLowerCase().includes(query);
        const emailMatch = (p.email || "").toLowerCase().includes(query);
        const teamMatch = (p.team_name || "").toLowerCase().includes(query);
        return nameMatch || emailMatch || teamMatch;
      }
      return true;
    });
  }, [localProfiles, localArchivedProfiles, memberView, selectedTeamId, selectedGroupId, searchQuery]);

  const activeMember = useMemo(() => {
    return localProfiles.find(p => p.id === activeMemberId) ?? null;
  }, [localProfiles, activeMemberId]);

  const effectiveRole = currentUserBusinessRole ?? currentUserRole;
  const isOwner = effectiveRole === "owner";
  const canManageGroups = teamManagement.access.canEditGroups;

  const leaderCandidates = useMemo(() => {
    return localProfiles
      .filter(p => p.role === "admin" && p.team_id === selectedTeamId && p.id !== currentUserId)
      .filter(p => !teamManagement.groups.some(g => g.leader_user_id === p.id));
  }, [localProfiles, selectedTeamId, teamManagement.groups, currentUserId]);

  const handleCreateTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    const tempId = `temp-${Date.now()}`;
    
    setLocalTeams(prev => [...prev, { id: tempId, name }]);
    setNewTeamName("");
    feedbackToast.success(`正在创建团队：${name}`);

    startTransition(async () => {
      const res = await createTeam(name);
      if (res.error) {
        setLocalTeams(prev => prev.filter(t => t.id !== tempId));
        setNewTeamName(name);
        feedbackToast.error(res.error);
      } else if (res.team) {
        setLocalTeams(prev => prev.map(t => t.id === tempId ? res.team! : t));
        feedbackToast.success(`团队「${name}」创建成功`);
        router.refresh();
      }
    });
  };

  const handleDeleteTeam = (team: TeamOption) => {
    setDeleteTeamTarget(null);
    const hasMembers = localProfiles.some(p => p.team_id === team.id);
    const hasGroups = teamManagement.groups.some(g => g.team_id === team.id);
    
    if (hasMembers || hasGroups) {
      feedbackToast.error("该团队下还有成员或分组，无法删除");
      return;
    }

    setLocalTeams(prev => prev.filter(t => t.id !== team.id));
    feedbackToast.success(`正在删除团队：${team.name}`);

    startTransition(async () => {
      const res = await deleteTeam(team.id);
      if (res.error) {
        setLocalTeams(prev => [...prev, team]);
        feedbackToast.error(res.error);
      } else {
        feedbackToast.success("团队删除成功");
        router.refresh();
      }
    });
  };

  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    if (!name || !newGroupLeaderId || selectedTeamId === "__all__") return;

    feedbackToast.success("正在创建分组");
    startTransition(async () => {
      const res = await createGroup({
        teamId: selectedTeamId,
        name,
        leaderUserId: newGroupLeaderId
      });
      if (res.error) {
        feedbackToast.error(res.error);
      } else {
        feedbackToast.success(`分组「${name}」创建成功`);
        setNewGroupName("");
        setNewGroupLeaderId("");
        router.refresh();
      }
    });
  };

  const handleAssignMemberToGroup = (memberId: string, groupId: string | null) => {
    const prevProfiles = localProfiles;
    setLocalProfiles(prev => prev.map(p => p.id === memberId ? { ...p, group_id: groupId } : p));
    
    startTransition(async () => {
      let res;
      if (groupId) {
        res = await assignMembersToGroup({ groupId, memberIds: [memberId] });
      } else {
        res = await removeMemberFromGroup(memberId);
      }
      if (res.error) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error(res.error);
      } else {
        feedbackToast.success("成员分组调配成功");
      }
    });
  };

  const handleReviewJoinRequest = (requestId: string, action: "approve" | "reject") => {
    const targetRequest = pendingRequests.find(r => r.id === requestId);
    if (!targetRequest) return;

    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    feedbackToast.success(`已提交审批操作`);

    startTransition(async () => {
      const actionFn = action === "approve" ? approveJoinRequestAction : rejectJoinRequestAction;
      const res = await actionFn(requestId, "通过管理员工作台一键审批");
      if (!res.ok) {
        setPendingRequests(prev => [...prev, targetRequest]);
        feedbackToast.error(res.error);
      } else {
        feedbackToast.success(action === "approve" ? "申请已批准，成员已加入团队" : "申请已驳回");
        const response = await fetch("/api/admin/modules/member-emails", { cache: "no-store" });
        if (response.ok) {
          router.refresh();
        }
      }
    });
  };

  const handleToggleRole = (member: ProfileSummary) => {
    const newRole = member.role === "admin" ? "member" : "admin";
    const prevProfiles = localProfiles;
    
    setLocalProfiles(prev => prev.map(p => p.id === member.id ? { ...p, role: newRole } : p));
    feedbackToast.success(`角色更新为：${newRole === "admin" ? "管理员" : "普通成员"}`);

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
    const targetTeam = localTeams.find(t => t.id === teamId);
    
    setLocalProfiles(prev => prev.map(p => p.id === memberId ? { 
      ...p, 
      team_id: teamId, 
      team_name: targetTeam?.name ?? null,
      group_id: null
    } : p));

    startTransition(async () => {
      const res = await updateMemberTeam(memberId, teamId);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error(res.error);
      } else {
        feedbackToast.success(`已调配至 ${targetTeam?.name ?? "未分配"}`);
        router.refresh();
      }
    });
  };

  const handleRemoveMemberFromTeam = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    const prevProfiles = localProfiles;
    setLocalProfiles(prev => prev.map((profile) => profile.id === target.id
      ? { ...profile, team_id: null, group_id: null, team_name: null }
      : profile));
    feedbackToast.success(`正在将 ${target.name} 移出团队`);

    startTransition(async () => {
      const res = await removeMemberFromTeam(target.id);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        setRemoveTarget(target);
        feedbackToast.error(res.error);
      } else {
        feedbackToast.success("已移出团队，账号仍可登录且数据保留");
        router.refresh();
      }
    });
  };

  const handleArchiveMember = () => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    const reason = archiveReason.trim();
    if (!reason) {
      feedbackToast.error("归档必须填写原因");
      return;
    }

    const previousProfiles = localProfiles;
    setArchiveTarget(null);
    setArchiveReason("");
    setLocalProfiles((prev) => prev.filter((profile) => profile.id !== target.id));
    if (activeMemberId === target.id) setActiveMemberId(null);

    startTransition(async () => {
      const res = await archiveMember(target.id, reason);
      if (res.error) {
        setLocalProfiles(previousProfiles);
        setArchiveTarget(target);
        setArchiveReason(reason);
        feedbackToast.error(res.error);
        return;
      }
      feedbackToast.success("账号已归档，历史数据仍保留");
      router.refresh();
    });
  };

  const handleRestoreMember = () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    const previousArchivedProfiles = localArchivedProfiles;
    const previousProfiles = localProfiles;
    setRestoreTarget(null);
    setLocalArchivedProfiles((prev) => prev.filter((profile) => profile.id !== target.id));
    setLocalProfiles((prev) => [
      ...prev,
      {
        ...target,
        role: "member",
        membership_status: "active",
        team_id: null,
        group_id: null,
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
      feedbackToast.success("账号已恢复，请重新分配团队和权限");
      router.refresh();
    });
  };

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
        feedbackToast.success(`成员 ${target.name} 的密码已成功重置`);
        setPasswordResetTarget(null);
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  };

  const handleSelectMember = (member: ProfileSummary) => {
    if (activeMemberId === member.id) {
      setActiveMemberId(null);
      setDraftPermissions({});
      setAiSuggestion(null);
      return;
    }
    setActiveMemberId(member.id);
    setDraftPermissions({ ...member.permissions });
    setAiSuggestion(null);
  };

  const handleTogglePermission = (key: PermissionKey, checked: boolean) => {
    setDraftPermissions(prev => ({
      ...prev,
      [key]: checked
    }));
  };

  const handleSavePermissions = () => {
    if (!activeMemberId || !activeMember) return;
    const prevProfiles = localProfiles;
    const nextPerms = { ...draftPermissions };

    setLocalProfiles(prev => prev.map(p => p.id === activeMemberId ? { ...p, permissions: nextPerms } : p));
    feedbackToast.success("正在保存权限变更...");

    startSavingPermissions(async () => {
      const res = await updatePermissions(activeMemberId, nextPerms);
      if (res.error) {
        setLocalProfiles(prevProfiles);
        feedbackToast.error(res.error);
      } else {
        feedbackToast.success("权限保存成功，下一次访问时生效");
        router.refresh();
      }
    });
  };

  const handleFetchAiSuggestion = async () => {
    if (!activeMemberId) return;
    setAiSuggestion({ status: "normal", summary: "", suggestions: [], loading: true });
    
    try {
      const res = await fetch("/api/admin/member-ai-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: activeMemberId })
      });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      setAiSuggestion({
        status: payload.status || "normal",
        summary: payload.summary || "权限状态良好，与岗位职责高度契合。",
        suggestions: payload.suggestions || [],
        loading: false
      });
    } catch {
      feedbackToast.error("获取 AI 建议失败");
      setAiSuggestion(null);
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
          toolArgs: suggestion.action.toolArgs ?? {}
        })
      });
      
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        feedbackToast.error(payload.error || "AI 执行失败");
      } else {
        feedbackToast.success(`${suggestion.label}：一键执行成功`);
        void handleFetchAiSuggestion();
        router.refresh();
      }
    } catch {
      feedbackToast.error("执行超时或网络异常");
    } finally {
      setExecutingAiKey(null);
    }
  };

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr] relative items-start">
      
      {/* 左侧栏：团队架构树 */}
      <aside className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
          <span className="text-[13px] font-medium tracking-tight text-zinc-900">团队架构树</span>
          <span className="text-[12px] uppercase tracking-wider text-zinc-500">Structure</span>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => { setSelectedTeamId("__all__"); setSelectedGroupId(null); }}
            className={cn(
              "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all duration-150 active:scale-[0.98]",
              selectedTeamId === "__all__"
                ? "bg-[#5F82A8]/10 border-zinc-300 text-zinc-900 font-medium"
                : "border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100/50 hover:text-zinc-900"
            )}
          >
            <span className="flex items-center gap-2">
              <UsersRound className="size-4 text-zinc-500" />
              全员大盘
            </span>
            <span className="rounded-full bg-zinc-200/60 px-2 py-0.5 text-[12px] text-zinc-700">
              {localProfiles.length}
            </span>
          </button>

          {localTeams.map(team => {
            const teamMembers = localProfiles.filter(p => p.team_id === team.id);
            const teamGroups = teamManagement.groups.filter(g => g.team_id === team.id);
            const isTeamSelected = selectedTeamId === team.id;
            
            return (
              <div key={team.id} className="space-y-1">
                <div
                  className={cn(
                    "group flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all duration-150",
                    isTeamSelected && !selectedGroupId
                      ? "bg-[#5F82A8]/10 border-zinc-300 text-zinc-900 font-medium"
                      : "border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100/50 hover:text-zinc-900"
                  )}
                >
                  <button
                    type="button"
                    aria-current={isTeamSelected && !selectedGroupId ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4532F]/40"
                    onClick={() => { setSelectedTeamId(team.id); setSelectedGroupId(null); }}
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className={cn("size-1.5 rounded-full", isTeamSelected ? "bg-[#5F82A8]" : "bg-zinc-300")} />
                      <span className="truncate font-medium">{team.name}</span>
                    </span>
                    <span className="rounded-full bg-zinc-200/60 px-2 py-0.5 text-[12px] text-zinc-700">
                      {teamMembers.length}
                    </span>
                  </button>
                  {isOwner && teamMembers.length === 0 && teamGroups.length === 0 && (
                    <button
                      type="button"
                      aria-label={`删除团队 ${team.name}`}
                      onClick={() => setDeleteTeamTarget(team)}
                      className="ml-1 rounded-lg p-1 text-zinc-500/60 opacity-100 transition-opacity hover:text-[#C9604D] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>

                {isTeamSelected && (
                  <div className="ml-3 border-l border-zinc-200 pl-3 space-y-1 pt-0.5 pb-1">
                    {teamGroups.map(group => {
                      const groupMembers = teamMembers.filter(p => p.group_id === group.id);
                      const isGroupSelected = selectedGroupId === group.id;
                      const leaderName = localProfiles.find(p => p.id === group.leader_user_id)?.name || "无";
                      
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => setSelectedGroupId(group.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors",
                            isGroupSelected
                              ? "bg-zinc-200/80 text-zinc-900 font-medium"
                              : "text-zinc-500 hover:bg-zinc-100/50 hover:text-zinc-900"
                          )}
                        >
                          <span className="truncate">
                            <span className="block truncate">{group.name}</span>
                            <span className="block scale-90 origin-left text-[12px] text-zinc-500 font-normal">
                              组长: {leaderName}
                            </span>
                          </span>
                          <span className="text-[12px] text-zinc-500">{groupMembers.length}人</span>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setSelectedGroupId("__direct__")}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors",
                        selectedGroupId === "__direct__"
                          ? "bg-zinc-200/80 text-zinc-900 font-medium"
                          : "text-zinc-500 hover:bg-zinc-100/50 hover:text-zinc-900"
                      )}
                    >
                      <span>未分配组员</span>
                      <span className="text-[12px] text-zinc-500">
                        {teamMembers.filter(p => p.role === "member" && !p.group_id).length}人
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isOwner && (
          <div className="border-t border-zinc-200/80 pt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-team-name" className="text-[12px] font-normal text-zinc-500 uppercase tracking-wider">快捷新建团队</Label>
              <div className="flex gap-1.5">
                <Input
                  id="quick-team-name"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="如: 广州一部"
                  className="h-8.5 text-[12px] bg-zinc-100/60 border-transparent focus:bg-white focus:border-zinc-500 focus:shadow-sm focus:ring-1 focus:ring-zinc-900/5 rounded-lg"
                />
                <Button
                  onClick={handleCreateTeam}
                  aria-label="新建团队"
                  disabled={isPending || !newTeamName.trim()}
                  className="h-8.5 px-3 bg-[#D97757] text-white hover:bg-[#C96442] active:scale-95 rounded-lg shrink-0"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            {selectedTeamId !== "__all__" && canManageGroups && (
              <div className="space-y-2 border-t border-dashed border-zinc-200 pt-3">
                <Label htmlFor="quick-group-name" className="text-[12px] font-normal text-zinc-500 uppercase tracking-wider">在当前团队建组</Label>
                <div className="space-y-1.5">
                  <Input
                    id="quick-group-name"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="组名，如: 财经二组"
                    className="h-8.5 text-[12px] bg-zinc-100/60 border-transparent focus:bg-white focus:border-zinc-500 focus:shadow-sm focus:ring-1 focus:ring-zinc-900/5 rounded-lg"
                  />
                  <select
                    aria-label="组长"
                    value={newGroupLeaderId}
                    onChange={e => setNewGroupLeaderId(e.target.value)}
                    className="w-full h-8.5 text-[12px] bg-zinc-100/60 border-transparent focus:bg-white focus:border-zinc-500 focus:shadow-sm focus:ring-1 focus:ring-zinc-900/5 rounded-lg px-2 text-zinc-700 outline-none border"
                  >
                    <option value="">选择组长</option>
                    {leaderCandidates.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <Button
                    onClick={handleCreateGroup}
                    disabled={isPending || !newGroupName.trim() || !newGroupLeaderId}
                    className="h-8.5 w-full bg-[#D97757] text-white hover:bg-[#C96442] active:scale-95 rounded-lg text-[12px]"
                  >
                    创建组
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* 中间栏：工作台与审批 */}
      <main className="space-y-6">
        {pendingRequests.length > 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-medium text-zinc-900">待审批入团申请</span>
              <span className="inline-flex items-center rounded-full bg-[#D99E55]/15 px-2.5 py-0.5 text-[12px] font-medium text-[#9B6B2E] tracking-tight">
                {pendingRequests.length} 个待办
              </span>
            </div>

            <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
              {pendingRequests.map(req => (
                <div 
                  key={req.id} 
                  className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-medium text-zinc-900">{req.applicantName}</span>
                      <span className="text-[12px] text-zinc-500">
                        {new Date(req.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                    <p className="text-[12px] text-zinc-500">
                      申请加入团队：<span className="text-zinc-900 font-medium">{req.targetTeamName}</span>
                    </p>
                  </div>

                  <div className="mt-4 flex justify-end gap-2 border-t border-zinc-100 pt-3">
                    <Button
                      variant="ghost"
                      onClick={() => handleReviewJoinRequest(req.id, "reject")}
                      disabled={isPending}
                      className="h-7 px-3 text-[12px] text-[#C9604D] hover:bg-[#C9604D]/5 rounded-lg"
                    >
                      拒绝
                    </Button>
                    <Button
                      onClick={() => handleReviewJoinRequest(req.id, "approve")}
                      disabled={isPending}
                      className="h-7 px-3 text-[12px] bg-[#6FAA7D] hover:bg-[#5C9469] text-white rounded-lg active:scale-95"
                    >
                      同意加入
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-5">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 size-4 text-zinc-500 stroke-[1.5]" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索姓名、邮箱或所属团队..."
                className="h-9.5 pl-9 pr-4 text-[13px] bg-zinc-100/60 border-transparent focus:bg-white focus:border-zinc-500 focus:shadow-sm focus:ring-1 focus:ring-zinc-900/5 rounded-xl"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1" role="tablist" aria-label="成员状态">
                <button
                  type="button"
                  role="tab"
                  aria-selected={memberView === "active"}
                  onClick={() => setMemberView("active")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors",
                    memberView === "active" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800",
                  )}
                >
                  <UsersRound className="size-3.5" />
                  正常成员
                  <span className="tabular-nums">{localProfiles.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={memberView === "archived"}
                  onClick={() => { setMemberView("archived"); setActiveMemberId(null); }}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors",
                    memberView === "archived" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800",
                  )}
                >
                  <Archive className="size-3.5" />
                  已归档账号
                  <span className="tabular-nums">{localArchivedProfiles.length}</span>
                </button>
              </div>
              <span className="text-[12px] tabular-nums text-zinc-500 uppercase tracking-wider">
                展示 {filteredProfiles.length} / {memberView === "active" ? localProfiles.length : localArchivedProfiles.length} 人
              </span>
            </div>
          </div>

          {filteredProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <div className="relative size-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-dashed border-zinc-300 animate-[spin_40s_linear_infinite]" />
                <div className="absolute h-full w-px bg-zinc-200" />
                <div className="absolute w-full h-px bg-zinc-200" />
                <UsersRound className="size-6 text-zinc-500 z-10 stroke-[1.25]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[13px] font-medium text-zinc-700">未找到任何成员</h3>
                <p className="text-[12px] text-zinc-500 max-w-[260px] mx-auto leading-relaxed">
                  当前筛选条件或搜索词下无可管理的人员。您可以尝试点击左侧大盘或调整搜索条件。
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProfiles.map(member => {
                const isArchivedView = memberView === "archived";
                const isAdmin = member.role === "admin";
                const isCurrentMemberActive = activeMemberId === member.id;
                const groupAsLeader = teamManagement.groups.find(g => g.leader_user_id === member.id);
                const archiveSnapshot = member.archive_snapshot ?? {};
                const archivedTeamName = typeof archiveSnapshot.team_name === "string"
                  ? archiveSnapshot.team_name
                  : "未分配";
                const archivedRole = typeof archiveSnapshot.role === "string"
                  ? archiveSnapshot.role === "admin" ? "管理员" : "成员"
                  : "成员";
                
                return (
                  <div
                    key={member.id}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-150 hover:border-zinc-300 hover:shadow-sm",
                      isCurrentMemberActive
                        ? "border-[#5F82A8] bg-[#5F82A8]/5"
                        : "border-zinc-200 bg-white"
                    )}
                  >
                    <button
                      type="button"
                      disabled={isArchivedView}
                      aria-current={isCurrentMemberActive ? "true" : undefined}
                      className={cn(
                        "space-y-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4532F]/40",
                        isArchivedView && "cursor-default",
                      )}
                      onClick={() => { if (!isArchivedView) handleSelectMember(member); }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-[13px] font-medium text-zinc-900 flex items-center gap-1.5">
                            {member.name}
                            {member.id === currentUserId && (
                              <span className="scale-90 text-[12px] text-zinc-500 font-normal border border-zinc-200 px-1 rounded">我</span>
                            )}
                          </h4>
                          <span className="text-[12px] text-zinc-500 leading-none">
                            {member.email ? member.email : "邮箱获取中..."}
                          </span>
                        </div>

                        <span className={cn(
                          "inline-flex h-5.5 items-center gap-1 rounded-full px-2 text-[12px] font-medium tracking-tight border",
                          isArchivedView
                            ? "bg-zinc-100 border-zinc-200 text-zinc-600"
                            : isAdmin
                            ? "bg-white border-[#D97757]/30 text-zinc-900"
                            : "bg-zinc-100 border-transparent text-zinc-700"
                        )}>
                          {isArchivedView ? (
                            <>
                              <Archive className="size-3" />
                              已归档
                            </>
                          ) : isAdmin ? (
                            <>
                              <span className="size-1.5 rounded-full bg-[#D97757]" />
                              管理员
                            </>
                          ) : "成员"}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="inline-flex items-center rounded-lg bg-zinc-100 px-2 py-0.5 text-[12px] text-zinc-700 font-medium">
                          {isArchivedView ? archivedTeamName : member.team_name || "未分配团队"}
                        </span>
                        {isArchivedView ? (
                          <span className="inline-flex items-center rounded-lg bg-zinc-100/80 px-2 py-0.5 text-[12px] text-zinc-500">
                            归档前角色：{archivedRole}
                          </span>
                        ) : groupAsLeader ? (
                          <span className="inline-flex items-center rounded-lg bg-[#5F82A8]/15 px-2 py-0.5 text-[12px] text-[#5F82A8] font-medium">
                            组长 : {groupAsLeader.name}
                          </span>
                        ) : member.group_id ? (
                          <span className="inline-flex items-center rounded-lg bg-zinc-100/80 px-2 py-0.5 text-[12px] text-zinc-500">
                            {teamManagement.groups.find(g => g.id === member.group_id)?.name || "已分分组"}
                          </span>
                        ) : null}
                        
                        {!isArchivedView && member.exempt_type && (
                          <span className="inline-flex items-center rounded-lg bg-[#C9604D]/10 px-2 py-0.5 text-[12px] text-[#C9604D] font-medium">
                            已豁免
                          </span>
                        )}
                      </div>
                    </button>

                    {isArchivedView ? (
                      <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                        <div className="space-y-1 text-[12px] text-zinc-500">
                          <p>归档时间：{member.archived_at ? new Date(member.archived_at).toLocaleString("zh-CN") : "未知"}</p>
                          <p>归档人：{member.archived_by_name || member.archived_by || "未知"}</p>
                          <p className="line-clamp-2">原因：{member.archive_reason || "未填写"}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setRestoreTarget(member)}
                          disabled={!isOwner || isPending}
                          className="h-8 w-full rounded-lg border-zinc-300 text-[12px] text-zinc-700 hover:bg-zinc-50"
                        >
                          <RotateCcw className="size-3.5" />
                          恢复账号
                        </Button>
                      </div>
                    ) : (
                    <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 opacity-100 transition-opacity pointer-events-auto sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:pointer-events-auto">
                      <div className="flex items-center gap-1.5">
                        {isOwner && member.id !== currentUserId && (
                          <select
                            value={member.team_id ?? ""}
                            onChange={e => handleTransferMemberTeam(member.id, e.target.value ? e.target.value : null)}
                            onClick={e => e.stopPropagation()}
                            className="h-6.5 text-[12px] bg-zinc-50 border border-zinc-200 rounded px-1.5 text-zinc-700 outline-none"
                          >
                            <option value="">未分配团队</option>
                            {localTeams.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        )}

                        {canManageGroups && member.team_id && member.role === "member" && (
                          <select
                            value={member.group_id ?? ""}
                            onChange={e => handleAssignMemberToGroup(member.id, e.target.value ? e.target.value : null)}
                            onClick={e => e.stopPropagation()}
                            className="h-6.5 text-[12px] bg-zinc-50 border border-zinc-200 rounded px-1.5 text-zinc-700 outline-none"
                          >
                            <option value="">直管成员</option>
                            {teamManagement.groups
                              .filter(g => g.team_id === member.team_id)
                              .map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))
                            }
                          </select>
                        )}
                      </div>

                      {isOwner && member.id !== currentUserId && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="修改角色"
                            onClick={(e) => { e.stopPropagation(); handleToggleRole(member); }}
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                          >
                            <Settings className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="重置密码"
                            onClick={(e) => { e.stopPropagation(); setPasswordResetTarget(member); }}
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                          >
                            <KeyRound className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 右侧属性抽屉 */}
      <Sheet
        open={activeMember !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveMemberId(null);
            setAiSuggestion(null);
          }
        }}
      >
        <SheetContent side="right" showCloseButton={false} className="h-dvh w-full max-w-[420px] gap-0 p-0 shadow-2xl">
          {activeMember ? (
            <>
            <div className="flex items-start justify-between border-b border-zinc-200 p-6">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <SheetTitle>{activeMember.name}</SheetTitle>
                  <span className={cn(
                    "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[12px] font-medium border",
                    activeMember.role === "admin"
                      ? "bg-white border-[#D97757]/30 text-zinc-900"
                      : "bg-zinc-100 border-transparent text-zinc-700"
                  )}>
                    {activeMember.role === "admin" ? "管理员" : "组员"}
                  </span>
                </div>
                <SheetDescription className="leading-none">
                  {activeMember.team_name || "未分配团队"} · {activeMember.email || "邮箱同步中"}
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
                    <Sparkles className="size-3 text-[#D97757] motion-safe:animate-pulse" />
                    AI 诊断
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => { setActiveMemberId(null); setAiSuggestion(null); }}
                  aria-label="关闭成员权限详情"
                  className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="size-4.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {aiSuggestion && (
                <div className={cn(
                  "rounded-xl border-l-2 bg-zinc-50 p-4 space-y-3",
                  aiSuggestion.status === "critical" ? "border-l-[#C9604D]" : "border-l-zinc-300"
                )}>
                  {aiSuggestion.loading ? (
                    <div className="flex items-center gap-2 text-[12px] text-zinc-500 py-2">
                      <RefreshCw className="size-3.5 animate-spin" />
                      AI 正在深度审查其日常填报及安全审计日志...
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between border-b border-zinc-200/50 pb-2">
                        <span className={cn(
                          "inline-flex rounded px-1.5 py-0.5 text-[12px] font-medium",
                          aiSuggestion.status === "critical" 
                            ? "bg-[#C9604D]/15 text-[#C9604D]" 
                            : "bg-[#5F82A8]/15 text-[#5F82A8]"
                        )}>
                          {aiSuggestion.status === "critical" ? "安全警告" : "诊断建议"}
                        </span>
                        <span className="text-[12px] text-zinc-500">AI 推理建议</span>
                      </div>
                      <p className="text-[12px] text-zinc-700 leading-relaxed">{aiSuggestion.summary}</p>
                      
                      {aiSuggestion.suggestions.map((sug, idx) => {
                        const key = `${sug.label}-${idx}`;
                        const isBusy = executingAiKey === key;
                        return (
                          <div key={idx} className="bg-white rounded-lg border border-zinc-200 p-2.5 flex items-start justify-between gap-3">
                            <div className="space-y-0.5">
                              <h5 className="text-[12px] font-medium text-zinc-900">{sug.label}</h5>
                              <p className="text-[12px] text-zinc-500 leading-relaxed">{sug.description}</p>
                            </div>
                            <Button
                              onClick={() => void handleExecuteAiSuggestion(sug, key)}
                              disabled={Boolean(executingAiKey)}
                              className="h-7 px-2.5 bg-zinc-950 text-white hover:bg-zinc-800 rounded text-[12px] shrink-0 active:scale-95"
                            >
                              {isBusy ? "执行中..." : "一键部署"}
                            </Button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {activeMember.role === "admin" ? (
                <>
                  <div className="space-y-2.5">
                    <h4 className="text-[12px] font-normal uppercase tracking-[0.2em] text-zinc-500">后台管理授权</h4>
                    <div className="grid gap-2">
                      {ADMIN_PERMISSION_KEYS.map(key => {
                        const isChecked = draftPermissions[key] === true;
                        return (
                          <label
                            key={key}
                            htmlFor={`admin-permission-${key}`}
                            className={cn(
                              "flex items-start justify-between rounded-xl border p-3 cursor-pointer transition-all duration-150",
                              isChecked
                                ? "border-[#5F82A8]/60 bg-[#5F82A8]/8"
                                : "border-zinc-200 bg-white hover:bg-zinc-50"
                            )}
                          >
                            <div className="space-y-0.5 pr-2">
                              <span className="text-[13px] font-medium text-zinc-900">{PERMISSION_LABELS[key]}</span>
                              <p className="text-[12px] text-zinc-500 leading-relaxed">
                                {PERMISSION_DESCRIPTIONS[key] || "后台管理和维护的基本操作。"}
                              </p>
                            </div>
                            <Checkbox
                              id={`admin-permission-${key}`}
                              checked={isChecked}
                              aria-label={PERMISSION_LABELS[key]}
                              disabled={!permissionManagerCapabilities.canEditPermissions || isSavingPermissions}
                              onCheckedChange={checked => handleTogglePermission(key, checked === true)}
                              className="mt-0.5"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <h4 className="text-[12px] font-normal uppercase tracking-[0.2em] text-zinc-500">AI 智能辅助授权</h4>
                    <div className="grid gap-2">
                      {AI_PERMISSION_KEYS.map(key => {
                        const isChecked = draftPermissions[key] === true;
                        return (
                          <label
                            key={key}
                            htmlFor={`ai-permission-${key}`}
                            className={cn(
                              "flex items-start justify-between rounded-xl border p-3 cursor-pointer transition-all duration-150",
                              isChecked
                                ? "border-[#5F82A8]/60 bg-[#5F82A8]/8"
                                : "border-zinc-200 bg-white hover:bg-zinc-50"
                            )}
                          >
                            <div className="space-y-0.5 pr-2">
                              <span className="text-[13px] font-medium text-zinc-900">{PERMISSION_LABELS[key]}</span>
                              <p className="text-[12px] text-zinc-500 leading-relaxed">
                                {PERMISSION_DESCRIPTIONS[key] || "分配和设置成员智能工作流辅助工具能力。"}
                              </p>
                            </div>
                            <Checkbox
                              id={`ai-permission-${key}`}
                              checked={isChecked}
                              aria-label={PERMISSION_LABELS[key]}
                              disabled={!permissionManagerCapabilities.canEditPermissions || isSavingPermissions}
                              onCheckedChange={checked => handleTogglePermission(key, checked === true)}
                              className="mt-0.5"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center">
                  <ShieldAlert className="size-5.5 text-zinc-500 stroke-[1.5]" />
                  <div>
                    <h5 className="text-[12px] font-medium text-zinc-700">组员无需单独授权</h5>
                    <p className="text-[12px] text-zinc-500 max-w-[200px] leading-relaxed mt-0.5">
                      系统内普通组员不享有单独管理和AI功能配置权。提升其角色为“管理员”即可开放授权。
                    </p>
                  </div>
                </div>
              )}

              {(isOwner || permissionManagerCapabilities.canRemoveMember) && activeMember.id !== currentUserId && activeMember.role !== "owner" && (
                <div className="space-y-3.5 border-t border-zinc-200 pt-6">
                  <h4 className="text-[12px] font-normal uppercase tracking-[0.2em] text-zinc-500">高级管理</h4>
                  
                  {isOwner && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        onClick={() => setPasswordResetTarget(activeMember)}
                        className="h-9 rounded-xl border-zinc-300 text-[12px] text-zinc-700 hover:bg-zinc-50"
                      >
                        重置账户密码
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setExemptionMemberId(activeMember.id)}
                        className="h-9 rounded-xl border-zinc-300 text-[12px] text-zinc-700 hover:bg-zinc-50"
                      >
                        {activeMember.exempt_type ? "调整日报豁免" : "开启日报豁免"}
                      </Button>
                    </div>
                  )}

                  {permissionManagerCapabilities.canRemoveMember && (
                    <Button
                      variant="outline"
                      onClick={() => setRemoveTarget(activeMember)}
                      className="h-9 w-full rounded-xl border-zinc-300 text-zinc-700 hover:bg-zinc-50 text-[12px]"
                    >
                      <UsersRound className="size-3.5" />
                      移出团队
                    </Button>
                  )}

                  {isOwner && (
                    <Button
                      variant="outline"
                      onClick={() => { setArchiveTarget(activeMember); setArchiveReason(""); }}
                      className="h-9 w-full rounded-xl border-[#C9604D]/35 hover:border-[#C9604D]/50 text-[#C9604D] hover:bg-[#C9604D]/5 text-[12px]"
                    >
                      <Archive className="size-3.5" />
                      归档账号
                    </Button>
                  )}
                </div>
              )}
            </div>

            {activeMember.role === "admin" && (
              <div className="flex flex-col gap-2 border-t border-zinc-200 bg-zinc-50 p-4">
                <span className="text-[12px] text-zinc-500">* 权限保存更改需要刷新浏览器刷新缓存以最终生效。</span>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => { setActiveMemberId(null); setDraftPermissions({}); }}
                    className="h-8.5 text-[12px] text-zinc-500 rounded-lg hover:bg-zinc-100"
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleSavePermissions}
                    disabled={isSavingPermissions || !permissionManagerCapabilities.canEditPermissions}
                    className="h-8.5 px-4 bg-[#D97757] hover:bg-[#C96442] text-white rounded-lg active:scale-95 text-[12px]"
                  >
                    {isSavingPermissions ? "保存中..." : "保存变更"}
                  </Button>
                </div>
              </div>
            )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* 所有的模态对话框 */}
      <Dialog
        open={passwordResetTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPasswordResetTarget(null);
            setNewPassword("");
            setConfirmPassword("");
          }
        }}
      >
        <DialogContent className="rounded-2xl border border-zinc-200 bg-white" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>重置账户密码</DialogTitle>
            <DialogDescription>
              {passwordResetTarget ? `为成员 ${passwordResetTarget.name} 设置新的账户密码。` : ""}
            </DialogDescription>
          </DialogHeader>
          {passwordResetTarget && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-[13px] text-zinc-700">
                <span className="block font-medium text-zinc-900">{passwordResetTarget.name}</span>
                <span className="block text-[12px]">{passwordResetTarget.email || "未关联邮箱"}</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v2-new-password">新密码</Label>
                <Input
                  id="v2-new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="不得少于 6 位"
                  className="rounded-lg h-9 bg-zinc-50 focus:bg-white focus:border-zinc-500 focus:shadow-sm focus:ring-1 focus:ring-zinc-900/5"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v2-confirm-password">确认新密码</Label>
                <Input
                  id="v2-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="重新输入新密码"
                  className="rounded-lg h-9 bg-zinc-50 focus:bg-white focus:border-zinc-500 focus:shadow-sm focus:ring-1 focus:ring-zinc-900/5"
                />
              </div>
            </div>
          )}
          <DialogFooter className="bg-white">
            <Button
              variant="outline"
              onClick={() => {
                setPasswordResetTarget(null);
                setNewPassword("");
                setConfirmPassword("");
              }}
              className="h-9 rounded-xl border-zinc-200 text-[12px]"
            >
              取消
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={isPending}
              className="h-9 bg-[#D97757] text-white hover:bg-[#C96442] active:scale-95 rounded-lg text-[12px] px-4"
            >
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTeamTarget !== null}
        title="删除团队"
        description={deleteTeamTarget ? `确定要删除团队「${deleteTeamTarget.name}」吗？此操作不可逆。` : ""}
        confirmText="确认删除"
        destructive
        loading={isPending}
        onConfirm={() => { if (deleteTeamTarget) handleDeleteTeam(deleteTeamTarget); }}
        onOpenChange={(o) => { if (!o) setDeleteTeamTarget(null); }}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        title="确认移出团队"
        description={removeTarget ? `确定将 ${removeTarget.name} 移出本团队吗？账号仍可登录，数据保留，之后可以重新分配团队。` : ""}
        confirmText="确认移出团队"
        loading={isPending}
        onConfirm={handleRemoveMemberFromTeam}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
      />

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) {
            setArchiveTarget(null);
            setArchiveReason("");
          }
        }}
      >
        <DialogContent className="rounded-2xl border border-zinc-200 bg-white">
          <DialogHeader>
            <DialogTitle>归档账号</DialogTitle>
            <DialogDescription>
              {archiveTarget ? `归档 ${archiveTarget.name} 后将立即禁止登录，清空团队与权限；日报、视频、账号和审计历史会保留。` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="archive-reason">归档原因</Label>
            <Textarea
              id="archive-reason"
              value={archiveReason}
              onChange={(event) => setArchiveReason(event.target.value)}
              placeholder="请填写归档原因"
              maxLength={500}
              disabled={isPending}
            />
            <p className="text-right text-[12px] text-zinc-500">{archiveReason.length}/500</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setArchiveTarget(null); setArchiveReason(""); }}
              disabled={isPending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchiveMember}
              disabled={isPending || !archiveReason.trim()}
            >
              {isPending ? "归档中..." : "确认归档"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={restoreTarget !== null}
        title="恢复账号"
        description={restoreTarget ? `确认恢复 ${restoreTarget.name} 吗？恢复后账号可登录，但会保持未分配团队、普通成员和空权限。` : ""}
        confirmText="确认恢复"
        loading={isPending}
        onConfirm={handleRestoreMember}
        onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}
      />

      <ExemptionDialog
        open={exemptionMemberId !== null}
        profile={exemptionMemberId ? (() => {
          const target = localProfiles.find(p => p.id === exemptionMemberId);
          return target ? {
            id: target.id,
            name: target.name,
            status: normalizeUserStatus(target.status),
            exempt_type: normalizeExemptionType(target.exempt_type),
            exempt_start_date: target.exempt_start_date || null,
            exempt_end_date: target.exempt_end_date || null,
            exempt_reason: target.exempt_reason || null,
            exemption_category: normalizeExemptionCategory(target.exemption_category)
          } : null;
        })() : null}
        onOpenChange={(o) => {
          if (!o) {
            setExemptionMemberId(null);
            router.refresh();
          }
        }}
      />
    </div>
  );
}
