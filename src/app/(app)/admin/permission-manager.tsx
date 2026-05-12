"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import { PERMISSION_KEYS, PERMISSION_LABELS } from "@/types";
import type { Permissions, UserRole } from "@/types";
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
  getChangedAdminPermissions,
  getPermissionManagerCapabilities,
  hasAdminPermissionChanges,
  resetMembersToBaseline,
  resolveMemberTeamTransfer,
  type PermissionManagerMember,
} from "./权限管理";

interface TeamOption {
  id: string;
  name: string;
}

interface PermissionManagerProps {
  members: PermissionManagerMember[];
  teams: TeamOption[];
  currentUserId: string;
  currentUserRole: UserRole;
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

interface EditPermTarget {
  memberId: string;
  memberName: string;
}

interface MoreTarget {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  teamId: string | null;
  teamName: string;
  canReset: boolean;
  canRemove: boolean;
}

type TeamFilter = "all" | string;

function getTeamLabel(teamName?: string | null) {
  return teamName?.trim() || "深圳二部";
}

function countEnabled(permissions: Permissions): number {
  return PERMISSION_KEYS.reduce((sum, key) => sum + (permissions[key] === true ? 1 : 0), 0);
}

interface MemberRowProps {
  member: PermissionManagerMember;
  teams: TeamOption[];
  actorRole: UserRole;
  actorId: string;
  actorPermissions: Permissions;
  actorTeamId: string | null;
  canEditPermissions: boolean;
  canChangeRoleForThis: boolean;
  disabled: boolean;
  onRoleChange: (memberId: string, memberName: string, role: "member" | "admin") => void;
  onOpenEditPerm: (memberId: string, memberName: string) => void;
  onTransferTeam: (memberId: string, memberName: string, oldTeamName: string, newTeamId: string | null, newTeamName: string) => void;
  onOpenMore: (target: MoreTarget) => void;
}

function MemberRow({
  member,
  teams,
  actorRole,
  actorId,
  actorPermissions,
  actorTeamId,
  canEditPermissions,
  canChangeRoleForThis,
  disabled,
  onRoleChange,
  onOpenEditPerm,
  onTransferTeam,
  onOpenMore,
}: MemberRowProps) {
  const isAdmin = member.role === "admin";
  const enabledCount = isAdmin ? countEnabled(member.permissions) : 0;
  const totalCount = PERMISSION_KEYS.length;
  const currentTeamName = getTeamLabel(member.teamName);

  const teamOptionsForMember = useMemo(() => {
    const candidates: Array<{ value: string; label: string }> = [
      { value: "__none__", label: "未分配" },
      ...teams.map((team) => ({ value: team.id, label: team.name })),
    ];
    return candidates.filter((opt) => {
      const newTeamId = opt.value === "__none__" ? null : opt.value;
      if (newTeamId === (member.teamId ?? null)) return true;
      const decision = resolveMemberTeamTransfer({
        actorRole,
        actorId,
        actorPermissions,
        actorTeamId,
        targetId: member.id,
        targetRole: member.role,
        targetTeamId: member.teamId ?? null,
        newTeamId,
      });
      return decision.shouldApply;
    });
  }, [teams, member.id, member.role, member.teamId, actorRole, actorId, actorPermissions, actorTeamId]);

  const canTransferTeam = teamOptionsForMember.length > 1;
  const currentTeamValue = member.teamId ?? "__none__";

  const canOpenMore = !disabled;
  const canRemoveFromTeam = (() => {
    const decision = resolveMemberTeamTransfer({
      actorRole,
      actorId,
      actorPermissions,
      actorTeamId,
      targetId: member.id,
      targetRole: member.role,
      targetTeamId: member.teamId ?? null,
      newTeamId: null,
    });
    return decision.shouldApply;
  })();
  const canResetPassword = (() => {
    if (actorId === member.id) return false;
    if (member.role === "owner") return false;
    if (actorRole === "owner") return true;
    if (actorRole !== "admin") return false;
    if (actorPermissions.manage_members !== true) return false;
    return actorTeamId === (member.teamId ?? null);
  })();

  return (
    <div className="grid grid-cols-[80px_132px_88px_64px_32px] items-center gap-3 py-2 text-[12px]">
      <span className="truncate font-medium text-zinc-800 max-w-[80px]" title={member.name}>
        {member.name}
      </span>

      {canTransferTeam ? (
        <Select
          value={currentTeamValue}
          onValueChange={(value) => {
            const newTeamId = value === "__none__" ? null : value;
            const newTeamName = value === "__none__"
              ? "未分配"
              : teams.find((t) => t.id === value)?.name ?? "未分配";
            onTransferTeam(member.id, member.name, currentTeamName, newTeamId, newTeamName);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 w-full min-w-0 bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] text-[12px]">
            <SelectValue>{currentTeamName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {teamOptionsForMember.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="truncate text-zinc-500" title={currentTeamName}>
          {currentTeamName}
        </span>
      )}

      {canChangeRoleForThis ? (
        <Select
          value={member.role}
          onValueChange={(value) => onRoleChange(member.id, member.name, value as "member" | "admin")}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 w-full min-w-0 bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] text-[12px]">
            <SelectValue>{isAdmin ? "管理员" : "成员"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">管理员</SelectItem>
            <SelectItem value="member">成员</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <span className="text-zinc-400">{isAdmin ? "管理员" : "成员"}</span>
      )}

      {isAdmin && canEditPermissions ? (
        <button
          type="button"
          onClick={() => onOpenEditPerm(member.id, member.name)}
          disabled={disabled}
          className="group inline-flex h-7 items-center justify-center gap-1 rounded-[8px] border border-zinc-200 bg-zinc-50 text-[11px] font-medium tabular-nums text-zinc-600 transition-[background-color,border-color,color] duration-150 hover:border-zinc-300 hover:bg-white hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          title="编辑权限"
        >
          <span>
            {enabledCount}/{totalCount}
          </span>
          <Pencil className="size-3 stroke-[1.5] text-zinc-400 group-hover:text-zinc-600" />
        </button>
      ) : (
        <span className="text-center text-zinc-300">—</span>
      )}

      <button
        type="button"
        onClick={() =>
          onOpenMore({
            memberId: member.id,
            memberName: member.name,
            memberEmail: member.email ?? null,
            teamId: member.teamId ?? null,
            teamName: currentTeamName,
            canReset: canResetPassword,
            canRemove: canRemoveFromTeam,
          })
        }
        disabled={!canOpenMore}
        className="flex size-7 items-center justify-center rounded-[8px] text-zinc-400 transition-[background-color,color] duration-150 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        title="更多操作"
      >
        <MoreHorizontal className="size-4 stroke-[1.5]" />
        <span className="sr-only">更多操作</span>
      </button>
    </div>
  );
}

export function PermissionManager({
  members,
  teams,
  currentUserId,
  currentUserRole,
  currentUserPermissions,
}: PermissionManagerProps) {
  const router = useRouter();
  const [editableMembers, setEditableMembers] = useState(members);
  const [baselineMembers, setBaselineMembers] = useState(members);
  const [isSavingPermissions, startSavingPermissions] = useTransition();
  const [isChangingRole, startChangingRole] = useTransition();
  const [roleChangeTarget, setRoleChangeTarget] = useState<RoleChangeTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] = useState<PasswordResetTarget | null>(null);
  const [editPermTarget, setEditPermTarget] = useState<EditPermTarget | null>(null);
  const [moreTarget, setMoreTarget] = useState<MoreTarget | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRemoving, startRemoving] = useTransition();
  const [isResettingPassword, startResettingPassword] = useTransition();
  const [isTransferringTeam, startTransferringTeam] = useTransition();
  const [pmPage, setPmPage] = useState(1);
  const [pmShowAll, setPmShowAll] = useState(false);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const capabilities = getPermissionManagerCapabilities(currentUserRole, currentUserPermissions);
  const currentActor = editableMembers.find((member) => member.id === currentUserId);
  const actionDisabled =
    isChangingRole || isSavingPermissions || isRemoving || isResettingPassword || isTransferringTeam;

  useEffect(() => {
    setEditableMembers(members);
    setBaselineMembers(members);
  }, [members]);

  const teamOptions = useMemo(() => {
    const unique = Array.from(
      new Set(members.map((member) => getTeamLabel(member.teamName))),
    );
    return unique.sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [members]);

  const nonOwners = editableMembers.filter((member) => member.id !== currentUserId);
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
  const changedCount = useMemo(
    () => getChangedAdminPermissions(editableMembers, baselineMembers).length,
    [editableMembers, baselineMembers],
  );
  const hasPermissionChanges = changedCount > 0;

  const handlePermToggle = useCallback((memberId: string, key: string, checked: boolean) => {
    setEditableMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? { ...member, permissions: { ...member.permissions, [key]: checked } }
          : member,
      ),
    );
  }, []);

  const handleCancelPermissions = useCallback(() => {
    setEditableMembers((prev) => resetMembersToBaseline(prev, baselineMembers));
  }, [baselineMembers]);

  const handleSavePermissions = useCallback(() => {
    const changedMembers = getChangedAdminPermissions(editableMembers, baselineMembers);
    if (changedMembers.length === 0) return;
    const previousBaseline = baselineMembers;

    setBaselineMembers(editableMembers);
    feedbackToast.success("权限已保存");

    startSavingPermissions(async () => {
      const results = await Promise.all(
        changedMembers.map((member) => updatePermissions(member.id, member.permissions)),
      );
      const error = results.find((result) => result.error)?.error;

      if (error) {
        setBaselineMembers(previousBaseline);
        feedbackToast.error(error);
        return;
      }

      router.refresh();
    });
  }, [editableMembers, baselineMembers, router]);

  const requestRoleChange = useCallback(
    (memberId: string, memberName: string, newRole: "member" | "admin") => {
      const current = editableMembers.find((member) => member.id === memberId);
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
    [editableMembers, currentUserRole, currentUserId, currentUserPermissions, currentActor],
  );

  const handleRoleChange = useCallback(
    (memberId: string, newRole: "member" | "admin") => {
      const previousEditableMembers = editableMembers;
      const previousBaselineMembers = baselineMembers;

      setEditableMembers((prev) => applyRoleChangeToMember(prev, memberId, newRole));
      setBaselineMembers((prev) => applyRoleChangeToMember(prev, memberId, newRole));
      feedbackToast.success("角色已更新");

      startChangingRole(async () => {
        const res = await changeRole(memberId, newRole);
        if (res.error) {
          setEditableMembers(previousEditableMembers);
          setBaselineMembers(previousBaselineMembers);
          feedbackToast.error(res.error);
          return;
        }

        router.refresh();
      });
    },
    [editableMembers, baselineMembers, router],
  );

  function confirmRoleChange() {
    if (!roleChangeTarget) return;
    handleRoleChange(roleChangeTarget.memberId, roleChangeTarget.role);
    setRoleChangeTarget(null);
  }

  function handleRemoveMember() {
    if (!removeTarget) return;
    const target = removeTarget;
    const previousEditableMembers = editableMembers;
    const previousBaselineMembers = baselineMembers;

    const applyRemoval = (list: PermissionManagerMember[]) =>
      list.map((member) =>
        member.id === target.memberId
          ? { ...member, teamId: null, teamName: null }
          : member,
      );

    setEditableMembers(applyRemoval);
    setBaselineMembers(applyRemoval);
    setRemoveTarget(null);
    feedbackToast.success(`已将 ${target.memberName} 移出团队`);

    startRemoving(async () => {
      const res = await removeMemberFromTeam(target.memberId);
      if (res.error) {
        setEditableMembers(previousEditableMembers);
        setBaselineMembers(previousBaselineMembers);
        setRemoveTarget(target);
        feedbackToast.error(res.error);
        return;
      }

      router.refresh();
    });
  }

  const openPasswordResetDialog = useCallback((member: { id: string; name: string; email?: string | null; teamName?: string | null }) => {
    setPasswordResetTarget({
      memberId: member.id,
      memberName: member.name,
      memberEmail: member.email ?? null,
      teamName: member.teamName ?? null,
    });
    setNewPassword("");
    setConfirmPassword("");
  }, []);

  const openEditPermDialog = useCallback((memberId: string, memberName: string) => {
    setEditPermTarget({ memberId, memberName });
  }, []);

  const openMoreDialog = useCallback((target: MoreTarget) => {
    setMoreTarget(target);
  }, []);

  const handleTransferTeam = useCallback(
    (memberId: string, memberName: string, oldTeamName: string, newTeamId: string | null, newTeamName: string) => {
      const previousEditableMembers = editableMembers;
      const previousBaselineMembers = baselineMembers;
      const nextTeam = newTeamId ? teams.find((t) => t.id === newTeamId) ?? null : null;

      const applyTransfer = (list: PermissionManagerMember[]) =>
        list.map((member) =>
          member.id === memberId
            ? { ...member, teamId: newTeamId, teamName: nextTeam?.name ?? null }
            : member,
        );

      setEditableMembers(applyTransfer);
      setBaselineMembers(applyTransfer);
      feedbackToast.success(`已将 ${memberName} 从 ${oldTeamName} 调配至 ${newTeamName}`);

      startTransferringTeam(async () => {
        const res = await updateMemberTeam(memberId, newTeamId);
        if (res.error) {
          setEditableMembers(previousEditableMembers);
          setBaselineMembers(previousBaselineMembers);
          feedbackToast.error(res.error);
          return;
        }
        router.refresh();
      });
    },
    [editableMembers, baselineMembers, teams, router],
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
      router.refresh();
    });
  }

  const editingMember = editPermTarget
    ? editableMembers.find((m) => m.id === editPermTarget.memberId) ?? null
    : null;

  const pagedMembers = pmShowAll
    ? filteredMembers
    : filteredMembers.slice((pmPage - 1) * 20, pmPage * 20);
  const totalPages = Math.ceil(filteredMembers.length / 20);

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex items-center border-l-2 border-[#D97757] pl-3">
        <h2 className="text-[15px] font-medium tracking-tight text-zinc-800">成员与权限</h2>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Label htmlFor="team-filter" className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
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
            <SelectTrigger id="team-filter" className="h-9 w-[150px] bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]">
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
            placeholder="搜索姓名、邮箱或团队"
            className="h-9 w-full rounded-lg bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] sm:w-64"
          />
        </div>
        <span className="text-[12px] text-zinc-400 tabular-nums">
          显示 {filteredMembers.length} / {visibleMembers.length} 人
        </span>
      </div>

      {capabilities.canEditPermissions && hasPermissionChanges ? (
        <div className="flex items-center justify-between gap-4 border-l-[2px] border-l-[#D99E55] bg-zinc-50 py-2 pl-4 pr-2">
          <p className="text-[12px] text-zinc-600 tabular-nums">
            {changedCount} 人有未保存的权限更改
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-[12px] text-zinc-500 hover:text-zinc-800"
              onClick={handleCancelPermissions}
              disabled={!hasPermissionChanges || actionDisabled}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-[10px] bg-zinc-900 px-3 text-[12px] text-white hover:bg-zinc-800 hover:-translate-y-[1px] active:translate-y-0"
              onClick={handleSavePermissions}
              disabled={!hasPermissionChanges || actionDisabled}
            >
              {isSavingPermissions ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      ) : null}

      {filteredMembers.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-zinc-400">暂无可管理成员</p>
      ) : (
        <>
          <div className="grid gap-x-6 md:grid-cols-2">
            <div className="grid grid-cols-[80px_132px_88px_64px_32px] items-center gap-3 border-b border-zinc-200 pb-1.5 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              <span>姓名</span>
              <span>团队</span>
              <span>角色</span>
              <span className="text-center">权限</span>
              <span className="text-right">操作</span>
            </div>
            <div className="hidden grid-cols-[80px_132px_88px_64px_32px] items-center gap-3 border-b border-zinc-200 pb-1.5 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400 md:grid">
              <span>姓名</span>
              <span>团队</span>
              <span>角色</span>
              <span className="text-center">权限</span>
              <span className="text-right">操作</span>
            </div>
          </div>

          <div className="grid gap-x-6 md:grid-cols-2">
            {pagedMembers.map((member, index) => {
              const canChangeRoleForThis =
                capabilities.canChangeRole &&
                canChangeMemberRole({
                  actorRole: currentUserRole,
                  actorId: currentUserId,
                  actorPermissions: currentUserPermissions,
                  actorTeamId: currentActor?.teamId ?? null,
                  targetId: member.id,
                  targetRole: member.role,
                  targetPermissions: member.permissions,
                  targetTeamId: member.teamId ?? null,
                  newRole: member.role === "member" ? "admin" : "member",
                });

              const isLastInColumn =
                index === pagedMembers.length - 1 ||
                (pagedMembers.length % 2 === 0 && index === pagedMembers.length - 2);

              return (
                <div
                  key={member.id}
                  className={cn(
                    "border-zinc-100",
                    isLastInColumn ? "" : "border-b",
                  )}
                >
                  <MemberRow
                    member={member}
                    teams={teams}
                    actorRole={currentUserRole}
                    actorId={currentUserId}
                    actorPermissions={currentUserPermissions}
                    actorTeamId={currentActor?.teamId ?? null}
                    canEditPermissions={capabilities.canEditPermissions}
                    canChangeRoleForThis={canChangeRoleForThis}
                    disabled={actionDisabled}
                    onRoleChange={requestRoleChange}
                    onOpenEditPerm={openEditPermDialog}
                    onTransferTeam={handleTransferTeam}
                    onOpenMore={openMoreDialog}
                  />
                </div>
              );
            })}
          </div>

          {filteredMembers.length > 20 ? (
            <div className="flex flex-col items-center gap-2 pt-2">
              {!pmShowAll && totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pmPage === 1}
                    onClick={() => setPmPage((page) => page - 1)}
                    className="h-8 px-3 text-[12px] rounded-[10px] border-zinc-200"
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
                        "h-8 w-8 p-0 text-[12px] rounded-[10px]",
                        page === pmPage
                          ? "bg-white border-[#D97757]/40 text-[#D97757] hover:bg-white hover:border-[#D97757]/60"
                          : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50",
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
                    className="h-8 px-3 text-[12px] rounded-[10px] border-zinc-200"
                  >
                    下一页
                  </Button>
                </div>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="text-[12px] text-zinc-500 h-8"
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

      <Dialog
        open={editPermTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditPermTarget(null);
        }}
      >
        <DialogContent className="rounded-2xl bg-white border border-zinc-200 shadow-sm">
          <DialogHeader>
            <DialogTitle>
              {editPermTarget ? `${editPermTarget.memberName} 的权限` : "权限"}
            </DialogTitle>
            <DialogDescription>
              勾选变更后点击下方保存，或关闭弹窗后在顶部批量保存。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {editingMember
              ? PERMISSION_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2 py-2 transition-[background-color] duration-150 hover:bg-zinc-50"
                  >
                    <span className="text-[13px] text-zinc-700">{PERMISSION_LABELS[key]}</span>
                    <Checkbox
                      checked={editingMember.permissions[key] === true}
                      onCheckedChange={(checked) =>
                        handlePermToggle(editingMember.id, key, checked === true)
                      }
                      disabled={isSavingPermissions}
                    />
                  </label>
                ))
              : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="h-9 text-[12px] text-zinc-500 hover:text-zinc-800"
              onClick={() => setEditPermTarget(null)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="rounded-2xl bg-white border border-zinc-200 shadow-sm" showCloseButton={!isResettingPassword}>
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
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-500">
                <p>{passwordResetTarget.memberEmail || "未记录邮箱"}</p>
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
                className="rounded-lg bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
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
                className="rounded-lg bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
              />
            </div>
          </div>
          <DialogFooter className="bg-white border-zinc-200">
            <Button
              variant="outline"
              className="rounded-[10px] border-zinc-200"
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
              className="rounded-[10px] bg-zinc-900 text-white hover:bg-zinc-800 hover:-translate-y-[1px] active:translate-y-0"
              onClick={handleResetPassword}
              disabled={isResettingPassword}
            >
              {isResettingPassword ? "提交中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMoreTarget(null);
        }}
      >
        <DialogContent className="rounded-2xl bg-white border border-zinc-200 shadow-sm">
          <DialogHeader>
            <DialogTitle>
              {moreTarget ? `${moreTarget.memberName} · 更多操作` : "更多操作"}
            </DialogTitle>
            <DialogDescription>
              账号资料与高风险操作归集于此，避免主列表误触。
            </DialogDescription>
          </DialogHeader>
          {moreTarget ? (
            <div className="space-y-4">
              <div className="space-y-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[12px] text-zinc-500">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">邮箱</span>
                  <span className="truncate font-mono tabular-nums text-zinc-700" title={moreTarget.memberEmail ?? undefined}>
                    {moreTarget.memberEmail || "未记录"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">团队</span>
                  <span className="truncate text-zinc-700">{moreTarget.teamName}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={!moreTarget.canReset || actionDisabled}
                  onClick={() => {
                    if (!moreTarget) return;
                    openPasswordResetDialog({
                      id: moreTarget.memberId,
                      name: moreTarget.memberName,
                      email: moreTarget.memberEmail,
                      teamName: moreTarget.teamName,
                    });
                    setMoreTarget(null);
                  }}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-2 text-[13px] text-zinc-700 transition-[background-color,border-color,color] duration-150 hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>重置密码</span>
                  <span className="text-[11px] text-zinc-400">为该成员设置新登录密码</span>
                </button>
                <button
                  type="button"
                  disabled={!moreTarget.canRemove || actionDisabled}
                  onClick={() => {
                    if (!moreTarget) return;
                    setRemoveTarget({
                      memberId: moreTarget.memberId,
                      memberName: moreTarget.memberName,
                      teamName: moreTarget.teamName,
                    });
                    setMoreTarget(null);
                  }}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-2 text-[13px] text-zinc-700 transition-[background-color,border-color,color] duration-150 hover:border-[#C9604D]/40 hover:bg-[#C9604D]/5 hover:text-[#C9604D] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>移出团队</span>
                  <span className="text-[11px] text-zinc-400">脱离团队归属，不影响账号</span>
                </button>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              className="h-9 text-[12px] text-zinc-500 hover:text-zinc-800"
              onClick={() => setMoreTarget(null)}
            >
              关闭
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
        className="rounded-2xl bg-white border border-zinc-200 shadow-sm"
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
        className="rounded-2xl bg-white border border-zinc-200 shadow-sm"
        onConfirm={handleRemoveMember}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      />
    </div>
  );
}
