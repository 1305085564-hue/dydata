"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import { useAlertContextStore } from "@/components/ai-assistant/alert-context-store";
import type { BusinessRole } from "@/lib/business-role";
import {
  ADMIN_PERMISSION_KEYS,
  AI_PERMISSION_KEYS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
} from "@/types";
import type { PermissionKey, Permissions, UserRole } from "@/types";
import {
  updatePermissions,
  changeRole,
  resetMemberPassword,
  updateMemberTeam,
  removeMemberFromTeam,
} from "./actions";
import {
  applyRoleChangeToMember,
  canChangeMemberRole,
  canRemoveMemberTarget,
  getPermissionManagerCapabilities,
  resolveMemberTeamTransfer,
  type PermissionManagerMember,
} from "./权限管理";
import { ExemptionDialog } from "./豁免弹窗";

interface TeamOption {
  id: string;
  name: string;
}

interface PermissionManagerProps {
  members: PermissionManagerMember[];
  teams: TeamOption[];
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserBusinessRole?: BusinessRole;
  currentUserPermissions: Permissions;
}

interface RemoveTarget {
  memberId: string;
  memberName: string;
  teamName: string;
}

interface RoleChangeTarget {
  memberId: string;
  memberName: string;
  role: "member" | "admin";
}

interface PasswordResetTarget {
  memberId: string;
  memberName: string;
  memberEmail?: string | null;
  teamName?: string | null;
}

type TeamFilter = "all" | string;

interface AiSuggestionResponse {
  status: "normal" | "warning" | "critical";
  summary: string;
  suggestions: Array<{
    label: string;
    description: string;
    action: {
      type: "execute_tool" | "navigate";
      toolName?: string;
      toolArgs?: Record<string, unknown>;
      href?: string;
    };
  }>;
  generatedAt: string;
}

interface AiSuggestionState {
  memberId: string;
  data: AiSuggestionResponse | null;
  loading: boolean;
}

function getTeamLabel(teamName?: string | null) {
  return teamName?.trim() || "未分配";
}

function getEditableKeys(role: UserRole): readonly PermissionKey[] {
  if (role === "admin" || role === "member") return PERMISSION_KEYS;
  return [];
}

function countEnabled(permissions: Permissions, keys: readonly PermissionKey[]): number {
  return keys.reduce((sum, key) => sum + (permissions[key] === true ? 1 : 0), 0);
}

function arePermissionsEqual(a: Permissions, b: Permissions): boolean {
  return PERMISSION_KEYS.every((key) => (a[key] === true) === (b[key] === true));
}

interface MemberRowProps {
  member: PermissionManagerMember;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}

function MemberRow({ member, isActive, disabled, onClick }: MemberRowProps) {
  const isAdmin = member.role === "admin";
  const editableKeys = getEditableKeys(member.role);
  const enabledCount = countEnabled(member.permissions, editableKeys);
  const totalCount = editableKeys.length;
  const currentTeamName = getTeamLabel(member.teamName);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group grid w-full grid-cols-[1.4fr_1.4fr_1fr_44px_16px] items-center gap-x-6 rounded-xl px-4 py-3 text-left text-[13px]",
        "transition-[background-color,border-color] duration-150",
        "border border-transparent",
        isActive
          ? "bg-stone-50 border-stone-200"
          : "hover:bg-stone-50",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="truncate font-medium text-stone-900" title={member.name}>
        {member.name}
      </span>
      <span className="truncate text-stone-500" title={currentTeamName}>
        {currentTeamName}
      </span>
      <span className="flex justify-center">
        <span
          className={cn(
            "inline-flex h-6 items-center justify-center whitespace-nowrap rounded-xl px-2.5 text-[12px] font-medium tracking-tight",
            isAdmin
              ? "gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700"
              : "bg-stone-100 text-stone-700",
          )}
        >
          {isAdmin ? (
            <>
              <span className="size-1.5 rounded-full bg-[#D97757]" aria-hidden />
              管理员
            </>
          ) : "成员"}
        </span>
      </span>
      <span className="text-right text-[12px] tabular-nums text-stone-500">
        {totalCount > 0 ? `${enabledCount}/${totalCount}` : "—"}
      </span>
      <ChevronRight
        className={cn(
          "size-4 stroke-[1.5] text-stone-500/40 transition-colors duration-150",
          "group-hover:text-stone-500",
          isActive && "text-stone-700",
        )}
      />
    </button>
  );
}

export function PermissionManager({
  members,
  teams,
  currentUserId,
  currentUserRole,
  currentUserBusinessRole,
  currentUserPermissions,
}: PermissionManagerProps) {
  const router = useRouter();
  const [baselineMembers, setBaselineMembers] = useState(members);
  const [isSavingPermissions, startSavingPermissions] = useTransition();
  const [isChangingRole, startChangingRole] = useTransition();
  const [roleChangeTarget, setRoleChangeTarget] = useState<RoleChangeTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] = useState<PasswordResetTarget | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRemoving, startRemoving] = useTransition();
  const [isResettingPassword, startResettingPassword] = useTransition();
  const [isTransferringTeam, startTransferringTeam] = useTransition();
  const [pmPage, setPmPage] = useState(1);
  const [pmShowAll, setPmShowAll] = useState(false);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [sheetMemberId, setSheetMemberId] = useState<string | null>(null);
  const [exemptionMemberId, setExemptionMemberId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Permissions>({});
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestionState | null>(null);
  const [executingKey, setExecutingKey] = useState<string | null>(null);
  const { requestAssistantOpen } = useAlertContextStore();

  const capabilities = getPermissionManagerCapabilities(
    currentUserRole,
    currentUserPermissions,
    currentUserBusinessRole,
  );
  const currentActor = baselineMembers.find((member) => member.id === currentUserId);
  const actionDisabled =
    isChangingRole || isSavingPermissions || isRemoving || isResettingPassword || isTransferringTeam;

  useEffect(() => {
    setBaselineMembers(members);
  }, [members]);

  const teamOptions = useMemo(() => {
    const unique = Array.from(
      new Set(baselineMembers.map((member) => getTeamLabel(member.teamName))),
    );
    return unique.sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [baselineMembers]);

  const nonOwners = baselineMembers.filter((member) => member.id !== currentUserId);
  const roleChangeableMembers = nonOwners.filter((member) => {
    const nextRole = member.role === "member" ? "admin" : "member";
    return canChangeMemberRole({
      actorRole: currentUserRole,
      actorId: currentUserId,
      actorPermissions: currentUserPermissions,
      actorTeamId: currentActor?.teamId ?? null,
      targetId: member.id,
      targetRole: member.role,
      targetPermissions: member.permissions,
      targetTeamId: member.teamId ?? null,
      newRole: nextRole,
    });
  });
  const removableMembers = nonOwners.filter((member) =>
    canRemoveMemberTarget({
      actorRole: currentUserRole,
      actorId: currentUserId,
      actorPermissions: currentUserPermissions,
      actorTeamId: currentActor?.teamId ?? null,
      targetId: member.id,
      targetRole: member.role,
      targetPermissions: member.permissions,
      targetTeamId: member.teamId ?? null,
    }),
  );
  const visibleMembers = capabilities.canChangeRole ? roleChangeableMembers : removableMembers;
  const filteredMembers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return visibleMembers.filter((member) => {
      const currentTeam = getTeamLabel(member.teamName);
      const matchesTeam = teamFilter === "all" || currentTeam === teamFilter;
      if (!matchesTeam) return false;
      if (!normalizedQuery) return true;

      const haystack = [member.name, member.email ?? "", currentTeam].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [searchQuery, teamFilter, visibleMembers]);
  const hasAnyEmail = baselineMembers.some((member) => Boolean(member.email));

  const sheetMember = sheetMemberId
    ? baselineMembers.find((member) => member.id === sheetMemberId) ?? null
    : null;
  const sheetEditableKeys = sheetMember ? getEditableKeys(sheetMember.role) : [];
  const hasDraftChanges = sheetMember
    ? !arePermissionsEqual(sheetMember.permissions, draftPermissions)
    : false;

  const requestOpenSheet = useCallback(
    (memberId: string) => {
      if (sheetMemberId === memberId) return;
      if (sheetMemberId && hasDraftChanges) {
        feedbackToast.error("当前成员还有未保存的权限改动");
        return;
      }
      const next = baselineMembers.find((member) => member.id === memberId);
      if (!next) return;
      setSheetMemberId(memberId);
      setDraftPermissions({ ...next.permissions });
      setAiSuggestion(null);
    },
    [sheetMemberId, hasDraftChanges, baselineMembers],
  );

  const closeSheet = useCallback(() => {
    setSheetMemberId(null);
    setDraftPermissions({});
    setAiSuggestion(null);
  }, []);

  const fetchAiSuggestion = useCallback(async () => {
    if (!sheetMember) return;
    setAiSuggestion({ memberId: sheetMember.id, data: null, loading: true });
    try {
      const res = await fetch("/api/admin/member-ai-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: sheetMember.id }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as AiSuggestionResponse;
      setAiSuggestion({ memberId: sheetMember.id, data, loading: false });
    } catch {
      feedbackToast.error("获取 AI 建议失败");
      setAiSuggestion(null);
    }
  }, [sheetMember]);

  function buildExecuteToolPrompt(
    suggestion: AiSuggestionResponse["suggestions"][number],
  ) {
    const argsBlob =
      suggestion.action.toolArgs && Object.keys(suggestion.action.toolArgs).length > 0
        ? `\n参数：${JSON.stringify(suggestion.action.toolArgs)}`
        : "";
    return `请帮我执行：${suggestion.label}（${suggestion.description}，工具 ${suggestion.action.toolName ?? "未指定"}）${argsBlob}`;
  }

  const fallbackToAssistant = useCallback(
    (suggestion: AiSuggestionResponse["suggestions"][number]) => {
      requestAssistantOpen();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("dydata:assistant-prefill", {
            detail: { text: buildExecuteToolPrompt(suggestion) },
          }),
        );
      }
    },
    [requestAssistantOpen],
  );

  const handleExecuteSuggestion = useCallback(
    async (
      suggestion: AiSuggestionResponse["suggestions"][number],
      key: string,
    ) => {
      if (executingKey) return;
      if (suggestion.action.type === "navigate" && suggestion.action.href) {
        router.push(suggestion.action.href);
        return;
      }
      if (!suggestion.action.toolName) {
        fallbackToAssistant(suggestion);
        return;
      }
      setExecutingKey(key);
      try {
        const res = await fetch("/api/admin/execute-tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolName: suggestion.action.toolName,
            toolArgs: suggestion.action.toolArgs ?? {},
          }),
        });
        if (res.status === 409) {
          toast.message("该动作需要确认，已切换到 AI 对话流");
          fallbackToAssistant(suggestion);
          return;
        }
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; error?: string }
          | null;
        if (!res.ok || !json?.success) {
          toast.error(json?.error || "执行失败，已切换到 AI 对话流");
          fallbackToAssistant(suggestion);
          return;
        }
        toast.success(`${suggestion.label}：执行完成`);
        void fetchAiSuggestion();
      } catch {
        toast.error("网络异常，已切换到 AI 对话流");
        fallbackToAssistant(suggestion);
      } finally {
        setExecutingKey(null);
      }
    },
    [executingKey, router, fetchAiSuggestion, fallbackToAssistant],
  );

  const handlePermToggle = useCallback((key: PermissionKey, checked: boolean) => {
    setDraftPermissions((prev) => ({ ...prev, [key]: checked }));
  }, []);

  const handleSaveSheet = useCallback(() => {
    if (!sheetMember) return;
    if (!hasDraftChanges) return;
    const memberId = sheetMember.id;
    const previousBaseline = baselineMembers;
    const nextPermissions: Permissions = { ...draftPermissions };

    setBaselineMembers((prev) =>
      prev.map((member) =>
        member.id === memberId ? { ...member, permissions: nextPermissions } : member,
      ),
    );
    feedbackToast.success("权限已保存，成员下次刷新页面后生效");

    startSavingPermissions(async () => {
      const result = await updatePermissions(memberId, nextPermissions);
      if (result.error) {
        setBaselineMembers(previousBaseline);
        feedbackToast.error(result.error);
        return;
      }
    });
  }, [sheetMember, hasDraftChanges, draftPermissions, baselineMembers]);

  const handleResetDraft = useCallback(() => {
    if (!sheetMember) return;
    setDraftPermissions({ ...sheetMember.permissions });
  }, [sheetMember]);

  const requestRoleChange = useCallback(
    (memberId: string, memberName: string, newRole: "member" | "admin") => {
      const current = baselineMembers.find((member) => member.id === memberId);
      if (!current || current.role === newRole) return;
      if (
        !canChangeMemberRole({
          actorRole: currentUserRole,
          actorId: currentUserId,
          actorPermissions: currentUserPermissions,
          actorTeamId: currentActor?.teamId ?? null,
          targetId: current.id,
          targetRole: current.role,
          targetPermissions: current.permissions,
          targetTeamId: current.teamId ?? null,
          newRole,
        })
      ) {
        feedbackToast.error("不能调整该成员角色");
        return;
      }
      setRoleChangeTarget({ memberId, memberName, role: newRole });
    },
    [baselineMembers, currentUserRole, currentUserId, currentUserPermissions, currentActor],
  );

  const handleRoleChange = useCallback(
    (memberId: string, newRole: "member" | "admin") => {
      const previousBaselineMembers = baselineMembers;

      setBaselineMembers((prev) => applyRoleChangeToMember(prev, memberId, newRole));
      if (sheetMemberId === memberId) {
        setDraftPermissions((prev) => (newRole === "member" ? {} : prev));
      }
      feedbackToast.success("角色已更新");

      startChangingRole(async () => {
        const res = await changeRole(memberId, newRole);
        if (res.error) {
          setBaselineMembers(previousBaselineMembers);
          feedbackToast.error(res.error);
          return;
        }
      });
    },
    [baselineMembers, sheetMemberId],
  );

  function confirmRoleChange() {
    if (!roleChangeTarget) return;
    handleRoleChange(roleChangeTarget.memberId, roleChangeTarget.role);
    setRoleChangeTarget(null);
  }

  function handleRemoveMember() {
    if (!removeTarget) return;
    const target = removeTarget;
    const previousBaselineMembers = baselineMembers;

    setBaselineMembers((prev) =>
      prev.map((member) =>
        member.id === target.memberId
          ? { ...member, teamId: null, teamName: null }
          : member,
      ),
    );
    setRemoveTarget(null);
    if (sheetMemberId === target.memberId) {
      closeSheet();
    }
    feedbackToast.success(`已将 ${target.memberName} 移出团队`);

    startRemoving(async () => {
      const res = await removeMemberFromTeam(target.memberId);
      if (res.error) {
        setBaselineMembers(previousBaselineMembers);
        setRemoveTarget(target);
        feedbackToast.error(res.error);
        return;
      }
    });
  }

  const openPasswordResetDialog = useCallback(
    (member: { id: string; name: string; email?: string | null; teamName?: string | null }) => {
      setPasswordResetTarget({
        memberId: member.id,
        memberName: member.name,
        memberEmail: member.email ?? null,
        teamName: member.teamName ?? null,
      });
      setNewPassword("");
      setConfirmPassword("");
    },
    [],
  );

  const handleTransferTeam = useCallback(
    (
      memberId: string,
      memberName: string,
      oldTeamName: string,
      newTeamId: string | null,
      newTeamName: string,
    ) => {
      const previousBaselineMembers = baselineMembers;
      const nextTeam = newTeamId ? teams.find((t) => t.id === newTeamId) ?? null : null;

      setBaselineMembers((prev) =>
        prev.map((member) =>
          member.id === memberId
            ? { ...member, teamId: newTeamId, teamName: nextTeam?.name ?? null }
            : member,
        ),
      );
      feedbackToast.success(`已将 ${memberName} 从 ${oldTeamName} 调配至 ${newTeamName}`);

      startTransferringTeam(async () => {
        const res = await updateMemberTeam(memberId, newTeamId);
        if (res.error) {
          setBaselineMembers(previousBaselineMembers);
          feedbackToast.error(res.error);
          return;
        }
      });
    },
    [baselineMembers, teams],
  );

  function handleResetPassword() {
    if (!passwordResetTarget) return;

    const trimmedPassword = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (trimmedPassword.length < 6) {
      feedbackToast.error("密码至少需要 6 位。");
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      feedbackToast.error("两次输入的密码不一致。");
      return;
    }

    startResettingPassword(async () => {
      const res = await resetMemberPassword(passwordResetTarget.memberId, trimmedPassword);
      if (res.error) {
        feedbackToast.error(res.error);
        return;
      }

      feedbackToast.success(`已重置 ${passwordResetTarget.memberName} 的密码`);
      setPasswordResetTarget(null);
      setNewPassword("");
      setConfirmPassword("");
    });
  }

  const sheetTeamOptions = useMemo(() => {
    if (!sheetMember) return [] as Array<{ value: string; label: string }>;
    const candidates: Array<{ value: string; label: string }> = [
      { value: "__none__", label: "未分配" },
      ...teams.map((team) => ({ value: team.id, label: team.name })),
    ];
    return candidates.filter((opt) => {
      const newTeamId = opt.value === "__none__" ? null : opt.value;
      if (newTeamId === (sheetMember.teamId ?? null)) return true;
      const decision = resolveMemberTeamTransfer({
        actorRole: currentUserRole,
        actorId: currentUserId,
        actorPermissions: currentUserPermissions,
        actorTeamId: currentActor?.teamId ?? null,
        targetId: sheetMember.id,
        targetRole: sheetMember.role,
        targetTeamId: sheetMember.teamId ?? null,
        newTeamId,
      });
      return decision.shouldApply;
    });
  }, [sheetMember, teams, currentUserRole, currentUserId, currentUserPermissions, currentActor]);

  const sheetCanChangeRole =
    capabilities.canChangeRole && sheetMember
      ? canChangeMemberRole({
          actorRole: currentUserRole,
          actorId: currentUserId,
          actorPermissions: currentUserPermissions,
          actorTeamId: currentActor?.teamId ?? null,
          targetId: sheetMember.id,
          targetRole: sheetMember.role,
          targetPermissions: sheetMember.permissions,
          targetTeamId: sheetMember.teamId ?? null,
          newRole: sheetMember.role === "member" ? "admin" : "member",
        })
      : false;

  const sheetCanRemove = sheetMember
    ? resolveMemberTeamTransfer({
        actorRole: currentUserRole,
        actorId: currentUserId,
        actorPermissions: currentUserPermissions,
        actorTeamId: currentActor?.teamId ?? null,
        targetId: sheetMember.id,
        targetRole: sheetMember.role,
        targetTeamId: sheetMember.teamId ?? null,
        newTeamId: null,
      }).shouldApply
    : false;

  const sheetCanResetPassword = sheetMember
    ? (() => {
        if (currentUserId === sheetMember.id) return false;
        if (sheetMember.role === "owner") return false;
        if (currentUserRole === "owner") return true;
        if (currentUserRole !== "admin") return false;
        if (currentUserPermissions.manage_members !== true) return false;
        return (currentActor?.teamId ?? null) === (sheetMember.teamId ?? null);
      })()
    : false;

  const PAGE_SIZE = 24;
  const pagedMembers = pmShowAll
    ? filteredMembers
    : filteredMembers.slice((pmPage - 1) * PAGE_SIZE, pmPage * PAGE_SIZE);
  const totalPages = Math.ceil(filteredMembers.length / PAGE_SIZE);

  return (
    <div className="space-y-6 rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-4">
          <Label
            htmlFor="team-filter"
            className="text-[12px] font-normal uppercase tracking-[0.25em] text-stone-500"
          >
            团队
          </Label>
          <Select
            value={teamFilter}
            onValueChange={(value) => {
              setTeamFilter(value as TeamFilter);
              setPmPage(1);
              setPmShowAll(false);
            }}
          >
            <SelectTrigger
              id="team-filter"
              className="h-9 w-[150px] border-transparent bg-stone-50 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5"
            >
              <SelectValue>{teamFilter === "all" ? "全部团队" : teamFilter}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部团队</SelectItem>
              {teamOptions.map((teamName) => (
                <SelectItem key={teamName} value={teamName}>
                  {teamName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setPmPage(1);
              setPmShowAll(false);
            }}
            placeholder={hasAnyEmail ? "搜索姓名、邮箱或团队" : "搜索姓名或团队，邮箱补全中"}
            className="h-9 w-full rounded-xl border-transparent bg-stone-50 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 sm:w-64"
          />
        </div>
        <span className="text-[12px] tabular-nums text-stone-500">
          显示 {filteredMembers.length} / {visibleMembers.length} 人
        </span>
      </div>

      {filteredMembers.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-stone-500">暂无可管理成员</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-[146px] px-4 pb-2 text-[12px] font-normal uppercase tracking-[0.25em] text-stone-500 lg:grid-cols-2">
            <div className="grid grid-cols-[1.4fr_1.4fr_1fr_44px_16px] items-center gap-x-6 border-b border-stone-200 pb-2">
              <span>姓名</span>
              <span>团队</span>
              <span className="text-center">角色</span>
              <span className="text-right">权限</span>
              <span aria-hidden />
            </div>
            <div className="hidden grid-cols-[1.4fr_1.4fr_1fr_44px_16px] items-center gap-x-6 border-b border-stone-200 pb-2 lg:grid">
              <span>姓名</span>
              <span>团队</span>
              <span className="text-center">角色</span>
              <span className="text-right">权限</span>
              <span aria-hidden />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-[146px] gap-y-2 lg:grid-cols-2">
            {pagedMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isActive={sheetMemberId === member.id}
                disabled={actionDisabled}
                onClick={() => requestOpenSheet(member.id)}
              />
            ))}
          </div>

          {filteredMembers.length > PAGE_SIZE ? (
            <div className="flex flex-col items-center gap-2 pt-2">
              {!pmShowAll && totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pmPage === 1}
                    onClick={() => setPmPage((page) => page - 1)}
                    className="h-8 rounded-xl border-stone-200 px-3 text-[12px]"
                  >
                    上一页
                  </Button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <Button
                      key={page}
                      size="sm"
                      variant={page === pmPage ? "default" : "outline"}
                      onClick={() => setPmPage(page)}
                      className={cn(
                        "h-8 w-8 rounded-xl p-0 text-[12px]",
                        page === pmPage
                          ? "border-[#D97757]/40 bg-white text-[#D97757] hover:border-[#D97757]/60 hover:bg-white"
                          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
                      )}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pmPage === totalPages}
                    onClick={() => setPmPage((page) => page + 1)}
                    className="h-8 rounded-xl border-stone-200 px-3 text-[12px]"
                  >
                    下一页
                  </Button>
                </div>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[12px] text-stone-500"
                onClick={() => {
                  setPmShowAll((value) => !value);
                  if (pmShowAll) setPmPage(1);
                }}
              >
                {pmShowAll ? "收起" : `展开全部（共 ${filteredMembers.length} 人）`}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Sheet
        open={sheetMember !== null}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent side="right" className="w-[480px] sm:max-w-none">
          {sheetMember ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <SheetTitle>{sheetMember.name}</SheetTitle>
                  <span
                    className={cn(
                      "inline-flex h-5 items-center justify-center rounded-xl px-2 text-[12px] font-medium tracking-tight",
                      sheetMember.role === "admin"
                        ? "gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700"
                        : "bg-stone-100 text-stone-700",
                    )}
                  >
                    {sheetMember.role === "admin" ? (
                      <>
                        <span className="size-1.5 rounded-full bg-[#D97757]" aria-hidden />
                        管理员
                      </>
                    ) : "成员"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={aiSuggestion?.loading}
                    onClick={fetchAiSuggestion}
                    className="h-8 rounded-xl border-stone-200 px-3 text-[12px] text-stone-700 hover:bg-stone-50"
                  >
                    {aiSuggestion?.loading ? (
                      <div className="space-y-2"><div className="h-10 rounded-lg bg-stone-100" /><div className="h-10 rounded-lg bg-stone-100" /><div className="h-10 rounded-lg bg-stone-100" /></div>
                    ) : (
                      <>
                        <Sparkles className="mr-1 size-3.5" />
                        AI 建议
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[12px] text-stone-500">
                  {getTeamLabel(sheetMember.teamName)}
                  <span className="ml-2 text-stone-500">
                    {sheetMember.email ? (
                      <span className="tabular-nums">{sheetMember.email}</span>
                    ) : "邮箱补全中"}
                  </span>
                </p>
              </SheetHeader>

              <SheetBody className="space-y-6">
                {aiSuggestion?.data ? (
                  <div
                    className={cn(
                      "mb-3 rounded-xl border-l-2 bg-stone-50/50 p-3",
                      aiSuggestion.data.status === "critical"
                        ? "border-l-[#C9604D]"
                        : aiSuggestion.data.status === "warning"
                          ? "border-l-[#D99E55]"
                          : "border-l-stone-300",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-5 items-center justify-center rounded-lg px-2 text-[12px] font-medium",
                            aiSuggestion.data.status === "critical"
                              ? "bg-[#C9604D]/10 text-[#C9604D]"
                              : aiSuggestion.data.status === "warning"
                                ? "bg-[#D99E55]/10 text-[#D99E55]"
                                : "bg-stone-100 text-stone-700",
                          )}
                        >
                          {aiSuggestion.data.status === "critical"
                            ? "需关注"
                            : aiSuggestion.data.status === "warning"
                              ? "警告"
                              : "正常"}
                        </span>
                        <span className="text-[12px] text-stone-500">
                          AI 分析于{" "}
                          {new Date(aiSuggestion.data.generatedAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiSuggestion(null)}
                        className="rounded-lg p-1 text-stone-500 transition-colors hover:bg-stone-200/50 hover:text-stone-700"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <p className="mb-3 text-[13px] text-stone-700">
                      {aiSuggestion.data.summary}
                    </p>
                    <div className="space-y-2">
                      {aiSuggestion.data.suggestions.map((suggestion, index) => {
                        const key = `${suggestion.label}-${index}`;
                        const isBusy = executingKey === key;
                        return (
                          <div
                            key={key}
                            className="flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-stone-900">
                                {suggestion.label}
                              </p>
                              <p className="text-[12px] text-stone-500">
                                {suggestion.description}
                              </p>
                            </div>
                            {suggestion.action.type === "navigate" &&
                            suggestion.action.href ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  router.push(suggestion.action.href!)
                                }
                                className="h-8 shrink-0 rounded-xl border-stone-200 px-3 text-[12px] text-stone-700 hover:bg-stone-50"
                              >
                                前往
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={Boolean(executingKey)}
                                onClick={() =>
                                  void handleExecuteSuggestion(suggestion, key)
                                }
                                className="h-8 shrink-0 rounded-xl border-stone-200 px-3 text-[12px] text-stone-700 hover:bg-stone-50"
                              >
                                {isBusy ? (
                                  <div className="space-y-2"><div className="h-10 rounded-lg bg-stone-100" /><div className="h-10 rounded-lg bg-stone-100" /><div className="h-10 rounded-lg bg-stone-100" /></div>
                                ) : (
                                  "执行"
                                )}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {sheetEditableKeys.length > 0 ? (
                  <>
                    <section className="space-y-2">
                      <p className="text-[12px] font-normal uppercase tracking-[0.25em] text-stone-500">
                        后台权限
                      </p>
                      <div className="rounded-xl border border-stone-200">
                        {ADMIN_PERMISSION_KEYS.map((key, index) => (
                          <label
                            key={key}
                            className={cn(
                              "flex cursor-pointer items-center justify-between gap-4 px-4 py-2 transition-[background-color] duration-150 hover:bg-stone-50",
                              index !== ADMIN_PERMISSION_KEYS.length - 1 &&
                                "border-b border-stone-200",
                            )}
                          >
                            <span className="text-[13px] text-stone-700">
                              {PERMISSION_LABELS[key]}
                            </span>
                            <Checkbox
                              checked={draftPermissions[key] === true}
                              onCheckedChange={(checked) =>
                                handlePermToggle(key, checked === true)
                              }
                              disabled={
                                isSavingPermissions || !capabilities.canEditPermissions
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <p className="text-[12px] font-normal uppercase tracking-[0.25em] text-stone-500">
                        AI 能力
                      </p>
                      <div className="rounded-xl border border-stone-200">
                        {AI_PERMISSION_KEYS.map((key, index) => (
                          <label
                            key={key}
                            className={cn(
                              "flex cursor-pointer items-start justify-between gap-4 px-4 py-2 transition-[background-color] duration-150 hover:bg-stone-50",
                              index !== AI_PERMISSION_KEYS.length - 1 &&
                                "border-b border-stone-200",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-stone-700">
                                {PERMISSION_LABELS[key]}
                              </p>
                              {PERMISSION_DESCRIPTIONS[key] ? (
                                <p className="mt-0.5 text-[12px] text-stone-500">
                                  {PERMISSION_DESCRIPTIONS[key]}
                                </p>
                              ) : null}
                            </div>
                            <Checkbox
                              checked={draftPermissions[key] === true}
                              onCheckedChange={(checked) =>
                                handlePermToggle(key, checked === true)
                              }
                              disabled={
                                isSavingPermissions || !capabilities.canEditPermissions
                              }
                              className="mt-0.5"
                            />
                          </label>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}

                <section className="space-y-4 border-t border-stone-200 pt-6">
                  <p className="text-[12px] font-normal uppercase tracking-[0.25em] text-stone-500">
                    成员操作
                  </p>

                  <div className="space-y-2">
                    <Label className="text-[12px] text-stone-700">角色</Label>
                    <Select
                      value={sheetMember.role}
                      onValueChange={(value) =>
                        requestRoleChange(
                          sheetMember.id,
                          sheetMember.name,
                          value as "member" | "admin",
                        )
                      }
                      disabled={!sheetCanChangeRole || actionDisabled}
                    >
                      <SelectTrigger className="h-9 border-stone-200 bg-white text-[13px]">
                        <SelectValue>
                          {sheetMember.role === "admin" ? "管理员" : "成员"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">管理员</SelectItem>
                        <SelectItem value="member">成员</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[12px] text-stone-700">团队</Label>
                    <Select
                      value={sheetMember.teamId ?? "__none__"}
                      onValueChange={(value) => {
                        const newTeamId = value === "__none__" ? null : value;
                        const newTeamName =
                          value === "__none__"
                            ? "未分配"
                            : teams.find((t) => t.id === value)?.name ?? "未分配";
                        handleTransferTeam(
                          sheetMember.id,
                          sheetMember.name,
                          getTeamLabel(sheetMember.teamName),
                          newTeamId,
                          newTeamName,
                        );
                      }}
                      disabled={sheetTeamOptions.length <= 1 || actionDisabled}
                    >
                      <SelectTrigger className="h-9 border-stone-200 bg-white text-[13px]">
                        <SelectValue>{getTeamLabel(sheetMember.teamName)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {sheetTeamOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!sheetCanResetPassword || actionDisabled}
                      onClick={() =>
                        openPasswordResetDialog({
                          id: sheetMember.id,
                          name: sheetMember.name,
                          email: sheetMember.email,
                          teamName: sheetMember.teamName,
                        })
                      }
                      className="h-9 rounded-xl border-stone-200 text-[12px] text-stone-700 hover:bg-stone-50"
                    >
                      重置密码
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!sheetCanRemove || actionDisabled}
                      onClick={() =>
                        setRemoveTarget({
                          memberId: sheetMember.id,
                          memberName: sheetMember.name,
                          teamName: getTeamLabel(sheetMember.teamName),
                        })
                      }
                      className="h-9 rounded-xl border-stone-200 text-[12px] text-[#C9604D] hover:border-[#C9604D]/40 hover:bg-[#C9604D]/5"
                    >
                      移出团队
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={actionDisabled}
                    onClick={() => setExemptionMemberId(sheetMember.id)}
                    className="h-9 w-full rounded-xl border-stone-200 text-[12px] text-stone-700 hover:bg-stone-50"
                  >
                    {sheetMember.exempt_type ? "调整豁免状态" : "设置豁免"}
                  </Button>
                </section>
              </SheetBody>

              <SheetFooter className="flex-col items-stretch gap-2">
                <p className="text-[12px] text-stone-500">
                  * 权限变更将在成员下次访问页面时生效
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="h-9 px-3 text-[12px] text-stone-500 hover:text-stone-900"
                    onClick={() => {
                      if (hasDraftChanges) {
                        handleResetDraft();
                      }
                      closeSheet();
                    }}
                    disabled={actionDisabled}
                  >
                    取消
                  </Button>
                  <Button
                    className="h-9 rounded-lg bg-[#D97757] px-4 text-[12px] text-white transition-[background-color] duration-150 hover:bg-[#C96442] active:translate-y-0"
                    onClick={handleSaveSheet}
                    disabled={
                      !hasDraftChanges || !capabilities.canEditPermissions || actionDisabled
                    }
                  >
                    {isSavingPermissions ? "保存中…" : "保存"}
                  </Button>
                </div>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={passwordResetTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isResettingPassword) {
            setPasswordResetTarget(null);
            setNewPassword("");
            setConfirmPassword("");
          }
        }}
      >
        <DialogContent
          className="rounded-2xl border border-stone-200 bg-white"
          showCloseButton={!isResettingPassword}
        >
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              {passwordResetTarget
                ? `为 ${passwordResetTarget.memberName} 设置新密码（至少 6 位）。`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {passwordResetTarget ? (
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-[13px] text-stone-500">
                <p>{passwordResetTarget.memberEmail || "邮箱稍后补全，不影响重置密码"}</p>
                <p>{getTeamLabel(passwordResetTarget.teamName)}</p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="admin-reset-password">新密码</Label>
              <Input
                id="admin-reset-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                disabled={isResettingPassword}
                className="rounded-xl border-transparent bg-stone-50 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-reset-password-confirm">确认新密码</Label>
              <Input
                id="admin-reset-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
                autoComplete="new-password"
                disabled={isResettingPassword}
                className="rounded-xl border-transparent bg-stone-50 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5"
              />
            </div>
          </div>
          <DialogFooter className="border-stone-200 bg-white">
            <Button
              variant="outline"
              className="rounded-xl border-stone-200"
              onClick={() => {
                setPasswordResetTarget(null);
                setNewPassword("");
                setConfirmPassword("");
              }}
              disabled={isResettingPassword}
            >
              取消
            </Button>
            <Button
              className="rounded-lg bg-[#D97757] text-white transition-[background-color] duration-150 hover:bg-[#C96442] active:translate-y-0"
              onClick={handleResetPassword}
              disabled={isResettingPassword}
            >
              {isResettingPassword ? "提交中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={roleChangeTarget !== null}
        title={roleChangeTarget?.role === "member" ? "确认调整为成员" : "确认调整为管理员"}
        description={
          roleChangeTarget
            ? roleChangeTarget.role === "member"
              ? `确定将 ${roleChangeTarget.memberName} 调整为成员吗？该操作会移除其管理员权限。`
              : `确定将 ${roleChangeTarget.memberName} 调整为管理员吗？`
            : ""
        }
        confirmText="确认调整"
        destructive={roleChangeTarget?.role === "member"}
        loading={isChangingRole}
        className="rounded-2xl border border-stone-200 bg-white"
        onConfirm={confirmRoleChange}
        onOpenChange={(open) => {
          if (!open) setRoleChangeTarget(null);
        }}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        title="确认移出团队"
        description={
          removeTarget
            ? `确定将 ${removeTarget.memberName} 移出 ${removeTarget.teamName} 吗？该成员仍保留账号与数据，仅脱离团队归属。`
            : ""
        }
        confirmText="确认移出"
        destructive
        loading={isRemoving}
        className="rounded-2xl border border-stone-200 bg-white"
        onConfirm={handleRemoveMember}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      />

      <ExemptionDialog
        open={exemptionMemberId !== null}
        profile={
          exemptionMemberId
            ? (() => {
                const target = baselineMembers.find((m) => m.id === exemptionMemberId);
                return target
                  ? {
                      id: target.id,
                      name: target.name,
                      status: target.status ?? "active",
                      exempt_type: target.exempt_type ?? null,
                      exempt_start_date: target.exempt_start_date ?? null,
                      exempt_end_date: target.exempt_end_date ?? null,
                      exempt_reason: target.exempt_reason ?? null,
                      exemption_category: target.exemption_category ?? null,
                    }
                  : null;
              })()
            : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setExemptionMemberId(null);
            router.refresh();
          }
        }}
      />
    </div>
  );
}
