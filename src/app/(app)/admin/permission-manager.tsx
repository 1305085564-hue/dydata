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
  const capabilities = getPermissionManagerCapabilities(currentUserRole, currentUserPermissions);

  useEffect(() => {
    setEditableMembers(members);
    setBaselineMembers(members);
  }, [members]);

  const nonOwners = editableMembers.filter((member) => member.id !== currentUserId);
  const removableMembers = nonOwners.filter((member) =>
    canRemoveMemberTarget({
      actorRole: currentUserRole,
      actorId: currentUserId,
      targetId: member.id,
      targetRole: member.role,
    })
  );
  const visibleMembers = capabilities.canChangeRole ? nonOwners : removableMembers;
  const hasPermissionChanges = useMemo(
    () => hasAdminPermissionChanges(editableMembers, baselineMembers),
    [editableMembers, baselineMembers]
  );

  function handlePermToggle(memberId: string, key: string, checked: boolean) {
    setEditableMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? { ...member, permissions: { ...member.permissions, [key]: checked } }
          : member
      )
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
        changedMembers.map((member) => updatePermissions(member.id, member.permissions))
      );
      const error = results.find((result) => result.error)?.error;

      if (error) {
        feedbackToast.error(error);
        return;
      }

      setBaselineMembers(changedMembers.length > 0 ? editableMembers : baselineMembers);
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

  function openPasswordResetDialog(memberId: string, memberName: string) {
    setPasswordResetTarget({ memberId, memberName });
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
      feedbackToast.error("两次输入的密码不一致");
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

  return (
    <div className="space-y-6">
      {visibleMembers.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无可管理成员</p>
      ) : (
        <>
          {capabilities.canEditPermissions && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {hasPermissionChanges ? "有未保存更改" : "权限勾选支持批量编辑后统一保存"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-11 md:h-8"
                onClick={handleCancelPermissions}
                disabled={!hasPermissionChanges || isSavingPermissions || isChangingRole}
              >
                取消
              </Button>
              <Button
                className="h-11 md:h-8"
                onClick={handleSavePermissions}
                disabled={!hasPermissionChanges || isSavingPermissions || isChangingRole}
              >
                {isSavingPermissions ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
          )}

          <div className="space-y-4">
            {(pmShowAll ? visibleMembers : visibleMembers.slice((pmPage - 1) * 10, pmPage * 10)).map((member) => (
              <div key={member.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{member.name}</span>
                    <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                      {member.role === "admin" ? "管理员" : "成员"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                  {capabilities.canRemoveMember && canRemoveMemberTarget({
                    actorRole: currentUserRole,
                    actorId: currentUserId,
                    targetId: member.id,
                    targetRole: member.role,
                  }) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 sm:h-10"
                        onClick={() => openPasswordResetDialog(member.id, member.name)}
                        disabled={isChangingRole || isSavingPermissions || isRemoving || isResettingPassword}
                      >
                        重置密码
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 sm:h-10 text-muted-foreground hover:text-destructive hover:border-destructive"
                        onClick={() => setRemoveTarget({ memberId: member.id, memberName: member.name })}
                        disabled={isChangingRole || isSavingPermissions || isRemoving || isResettingPassword}
                      >
                        移除
                      </Button>
                    </>
                  )}
                  {capabilities.canChangeRole && (
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      requestRoleChange(member.id, member.name, value as "member" | "admin")
                    }
                    disabled={isChangingRole || isSavingPermissions || isRemoving || isResettingPassword}
                    items={[
                      { value: "admin", label: "管理员" },
                      { value: "member", label: "成员" },
                    ]}
                  >
                    <SelectTrigger className="h-11 w-full sm:h-10 sm:w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">管理员</SelectItem>
                      <SelectItem value="member">成员</SelectItem>
                    </SelectContent>
                  </Select>
                  )}
                  </div>
                </div>

                {member.role === "admin" && capabilities.canEditPermissions && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {PERMISSION_KEYS.map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={member.permissions[key] === true}
                          onCheckedChange={(checked) =>
                            handlePermToggle(member.id, key, checked === true)
                          }
                          disabled={isSavingPermissions || isChangingRole}
                        />
                        {PERMISSION_LABELS[key]}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {visibleMembers.length > 10 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {!pmShowAll && Math.ceil(visibleMembers.length / 10) > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <Button variant="outline" size="sm" disabled={pmPage === 1} onClick={() => setPmPage((p) => p - 1)} className="h-8 px-3 text-xs">上一页</Button>
                  {Array.from({ length: Math.ceil(visibleMembers.length / 10) }, (_, i) => i + 1).map((p) => (
                    <Button key={p} size="sm" variant={p === pmPage ? "default" : "outline"} onClick={() => setPmPage(p)} className={`h-8 w-8 p-0 text-xs${p === pmPage ? " bg-[#007AFF] hover:bg-[#0066DD] border-[#007AFF]" : ""}`}>{p}</Button>
                  ))}
                  <Button variant="outline" size="sm" disabled={pmPage === Math.ceil(visibleMembers.length / 10)} onClick={() => setPmPage((p) => p + 1)} className="h-8 px-3 text-xs">下一页</Button>
                </div>
              )}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8" onClick={() => { setPmShowAll((v) => !v); if (pmShowAll) setPmPage(1); }}>
                {pmShowAll ? "收起" : `展开全部（共 ${visibleMembers.length} 人）`}
              </Button>
            </div>
          )}
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
        <DialogContent showCloseButton={!isResettingPassword}>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              {passwordResetTarget ? `为 ${passwordResetTarget.memberName} 设置新密码（至少 6 位）。` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordResetTarget(null);
                setNewPassword("");
                setConfirmPassword("");
              }}
              disabled={isResettingPassword}
            >
              取消
            </Button>
            <Button onClick={handleResetPassword} disabled={isResettingPassword}>
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
        onConfirm={confirmRoleChange}
        onOpenChange={(open) => {
          if (!open) setRoleChangeTarget(null);
        }}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        title="确认移除成员"
        description={removeTarget ? `确定将 ${removeTarget.memberName} 移出团队？此操作不可撤销。` : ""}
        confirmText="确认移除"
        destructive
        loading={isRemoving}
        onConfirm={handleRemoveMember}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      />
    </div>
  );
}
