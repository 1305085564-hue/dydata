"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { updatePermissions, changeRole, removeMember, resetMemberPassword } from "./actions";
import {
  applyRoleChangeToMember,
  canRemoveMemberTarget,
  getChangedAdminPermissions,
  getPermissionManagerCapabilities,
  hasAdminPermissionChanges,
  resetMembersToBaseline,
  type PermissionManagerMember,
} from "./权限管理";

interface PermissionManagerProps {
  members: PermissionManagerMember[];
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserPermissions: Permissions;
}

interface RemoveTarget {
  memberId: string;
  memberName: string;
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

function getTeamLabel(teamName?: string | null) {
  return teamName?.trim() || "深圳二部";
}

export function PermissionManager({
  members,
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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRemoving, startRemoving] = useTransition();
  const [isResettingPassword, startResettingPassword] = useTransition();
  const [pmPage, setPmPage] = useState(1);
  const [pmShowAll, setPmShowAll] = useState(false);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const capabilities = getPermissionManagerCapabilities(currentUserRole, currentUserPermissions);

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
  const removableMembers = nonOwners.filter((member) =>
    canRemoveMemberTarget({
      actorRole: currentUserRole,
      actorId: currentUserId,
      targetId: member.id,
      targetRole: member.role,
    }),
  );
  const visibleMembers = capabilities.canChangeRole ? nonOwners : removableMembers;
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
  const hasPermissionChanges = useMemo(
    () => hasAdminPermissionChanges(editableMembers, baselineMembers),
    [editableMembers, baselineMembers],
  );

  function handlePermToggle(memberId: string, key: string, checked: boolean) {
    setEditableMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? { ...member, permissions: { ...member.permissions, [key]: checked } }
          : member,
      ),
    );
  }

  function handleCancelPermissions() {
    setEditableMembers((prev) => resetMembersToBaseline(prev, baselineMembers));
  }

  function handleSavePermissions() {
    const changedMembers = getChangedAdminPermissions(editableMembers, baselineMembers);
    if (changedMembers.length === 0) return;

    startSavingPermissions(async () => {
      const results = await Promise.all(
        changedMembers.map((member) => updatePermissions(member.id, member.permissions)),
      );
      const error = results.find((result) => result.error)?.error;

      if (error) {
        feedbackToast.error(error);
        return;
      }

      setBaselineMembers(editableMembers);
      feedbackToast.success("权限已保存");
      router.refresh();
    });
  }

  function requestRoleChange(memberId: string, memberName: string, newRole: "member" | "admin") {
    const current = editableMembers.find((member) => member.id === memberId);
    if (!current || current.role === newRole) return;
    setRoleChangeTarget({ memberId, memberName, role: newRole });
  }

  function handleRoleChange(memberId: string, newRole: "member" | "admin") {
    startChangingRole(async () => {
      const res = await changeRole(memberId, newRole);
      if (res.error) {
        feedbackToast.error(res.error);
        return;
      }

      setEditableMembers((prev) => applyRoleChangeToMember(prev, memberId, newRole));
      setBaselineMembers((prev) => applyRoleChangeToMember(prev, memberId, newRole));
      feedbackToast.success("角色已更新");
      router.refresh();
    });
  }

  function confirmRoleChange() {
    if (!roleChangeTarget) return;
    handleRoleChange(roleChangeTarget.memberId, roleChangeTarget.role);
    setRoleChangeTarget(null);
  }

  function handleRemoveMember() {
    if (!removeTarget) return;
    startRemoving(async () => {
      const res = await removeMember(removeTarget.memberId);
      if (res.error) {
        feedbackToast.error(res.error);
        return;
      }

      feedbackToast.success(`已将 ${removeTarget.memberName} 移出团队`);
      setRemoveTarget(null);
      router.refresh();
    });
  }

  function openPasswordResetDialog(
    memberId: string,
    memberName: string,
    memberEmail?: string | null,
    teamName?: string | null,
  ) {
    setPasswordResetTarget({ memberId, memberName, memberEmail, teamName });
    setNewPassword("");
    setConfirmPassword("");
  }

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

  const pagedMembers = pmShowAll
    ? filteredMembers
    : filteredMembers.slice((pmPage - 1) * 10, pmPage * 10);
  const totalPages = Math.ceil(filteredMembers.length / 10);

  return (
    <div className="space-y-6">
      {filteredMembers.length === 0 ? (
        <p className="text-sm text-zinc-500">暂无可管理成员</p>
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-500">
                成员筛选：当前显示 {filteredMembers.length} / {visibleMembers.length} 人
              </p>
              <div className="flex items-center gap-2">
                <Label htmlFor="team-filter" className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
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
                  <SelectTrigger id="team-filter" className="h-10 w-[150px] bg-zinc-100/70 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]">
                    <SelectValue />
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
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Label htmlFor="member-search" className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400 sm:w-20">
                搜索成员
              </Label>
              <Input
                id="member-search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPmPage(1);
                  setPmShowAll(false);
                }}
                placeholder="输入姓名、邮箱或团队"
                className="h-10 rounded-lg bg-zinc-100/70 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] sm:max-w-xs"
              />
            </div>
          </div>

          {capabilities.canEditPermissions ? (
            <div
              className={cn(
                "flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between",
                hasPermissionChanges
                  ? "bg-zinc-50 border border-[#D99E55]/30 border-l-[2px] border-l-[#D99E55]"
                  : "bg-zinc-50 border border-zinc-200"
              )}
            >
              <p className="text-[13px] text-zinc-500">
                {hasPermissionChanges ? "有未保存更改" : "管理员权限支持批量勾选后统一保存"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="h-10 rounded-[10px] border-zinc-200"
                  onClick={handleCancelPermissions}
                  disabled={!hasPermissionChanges || isSavingPermissions || isChangingRole}
                >
                  取消
                </Button>
                <Button
                  className="h-10 rounded-[10px] bg-zinc-900 text-white hover:bg-zinc-800 hover:-translate-y-[1px] active:translate-y-0 hover:shadow-sm"
                  onClick={handleSavePermissions}
                  disabled={!hasPermissionChanges || isSavingPermissions || isChangingRole}
                >
                  {isSavingPermissions ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-0">
            {pagedMembers.map((member) => (
              <div key={member.id} className="py-4 border-b border-zinc-100 last:border-b-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[13px] font-medium text-zinc-800">{member.name}</span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-[10px] px-2.5 py-0.5 text-[12px] font-medium",
                        member.role === "admin"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-zinc-50 text-zinc-600 border border-zinc-200"
                      )}
                    >
                      {member.role === "admin" ? "管理员" : "成员"}
                    </span>
                    <span className="inline-flex items-center rounded-[10px] border border-zinc-200 px-2.5 py-0.5 text-[12px] text-zinc-500">
                      {getTeamLabel(member.teamName)}
                    </span>
                    <span className="text-[13px] text-zinc-500">{member.email || "未记录邮箱"}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {capabilities.canRemoveMember &&
                    canRemoveMemberTarget({
                      actorRole: currentUserRole,
                      actorId: currentUserId,
                      targetId: member.id,
                      targetRole: member.role,
                    }) ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 text-zinc-500 hover:text-zinc-800"
                          onClick={() =>
                            openPasswordResetDialog(
                              member.id,
                              member.name,
                              member.email,
                              member.teamName,
                            )
                          }
                          disabled={
                            isChangingRole || isSavingPermissions || isRemoving || isResettingPassword
                          }
                        >
                          重置密码
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 text-zinc-500 hover:text-[#C9604D]"
                          onClick={() =>
                            setRemoveTarget({ memberId: member.id, memberName: member.name })
                          }
                          disabled={
                            isChangingRole || isSavingPermissions || isRemoving || isResettingPassword
                          }
                        >
                          移除
                        </Button>
                      </>
                    ) : null}

                    {capabilities.canChangeRole ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          requestRoleChange(member.id, member.name, value as "member" | "admin")
                        }
                        disabled={
                          isChangingRole || isSavingPermissions || isRemoving || isResettingPassword
                        }
                      >
                        <SelectTrigger className="h-9 w-full sm:w-28 bg-zinc-100/70 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">管理员</SelectItem>
                          <SelectItem value="member">成员</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                </div>

                {member.role === "admin" && capabilities.canEditPermissions ? (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 bg-zinc-50 rounded-xl p-3">
                    {PERMISSION_KEYS.map((key) => (
                      <label key={key} className="flex items-center gap-2 text-[13px] cursor-pointer">
                        <Checkbox
                          checked={member.permissions[key] === true}
                          onCheckedChange={(checked) =>
                            handlePermToggle(member.id, key, checked === true)
                          }
                          disabled={isSavingPermissions || isChangingRole}
                        />
                        <span className="text-zinc-700">{PERMISSION_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {filteredMembers.length > 10 ? (
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
                          : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
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
                className="rounded-lg bg-zinc-100/70 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
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
                className="rounded-lg bg-zinc-100/70 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
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
              className="rounded-[10px] bg-zinc-900 text-white hover:bg-zinc-800 hover:-translate-y-[1px] active:translate-y-0 hover:shadow-sm"
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
        className="rounded-2xl bg-white border border-zinc-200 shadow-sm"
        onConfirm={confirmRoleChange}
        onOpenChange={(open) => {
          if (!open) setRoleChangeTarget(null);
        }}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        title="确认移除成员"
        description={removeTarget ? `确定将 ${removeTarget.memberName} 移出团队吗？此操作不可撤销。` : ""}
        confirmText="确认移除"
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
