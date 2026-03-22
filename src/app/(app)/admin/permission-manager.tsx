"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { PERMISSION_KEYS, PERMISSION_LABELS } from "@/types";
import { updatePermissions, changeRole, removeMember } from "./actions";
import {
  applyRoleChangeToMember,
  getChangedAdminPermissions,
  hasAdminPermissionChanges,
  resetMembersToBaseline,
  type PermissionManagerMember,
} from "./权限管理";

interface PermissionManagerProps {
  members: PermissionManagerMember[];
  currentUserId: string;
  isOwner: boolean;
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

export function PermissionManager({ members, currentUserId, isOwner }: PermissionManagerProps) {
  const router = useRouter();
  const [editableMembers, setEditableMembers] = useState(members);
  const [baselineMembers, setBaselineMembers] = useState(members);
  const [isSavingPermissions, startSavingPermissions] = useTransition();
  const [isChangingRole, startChangingRole] = useTransition();
  const [roleChangeTarget, setRoleChangeTarget] = useState<RoleChangeTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [isRemoving, startRemoving] = useTransition();
  const [pmPage, setPmPage] = useState(1);
  const [pmShowAll, setPmShowAll] = useState(false);

  useEffect(() => {
    setEditableMembers(members);
    setBaselineMembers(members);
  }, [members]);

  const nonOwners = editableMembers.filter((member) => member.id !== currentUserId);
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

  return (
    <div className="space-y-6">
      {nonOwners.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无其他成员</p>
      ) : (
        <>
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

          <div className="space-y-4">
            {(pmShowAll ? nonOwners : nonOwners.slice((pmPage - 1) * 10, pmPage * 10)).map((member) => (
              <div key={member.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{member.name}</span>
                    <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                      {member.role === "admin" ? "管理员" : "成员"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                  {isOwner && member.role !== "owner" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 sm:h-10 text-muted-foreground hover:text-destructive hover:border-destructive"
                      onClick={() => setRemoveTarget({ memberId: member.id, memberName: member.name })}
                      disabled={isChangingRole || isSavingPermissions || isRemoving}
                    >
                      移除
                    </Button>
                  )}
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      requestRoleChange(member.id, member.name, value as "member" | "admin")
                    }
                    disabled={isChangingRole || isSavingPermissions || isRemoving}
                  >
                    <SelectTrigger className="h-11 w-full sm:h-10 sm:w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">管理员</SelectItem>
                      <SelectItem value="member">成员</SelectItem>
                    </SelectContent>
                  </Select>
                  </div>
                </div>

                {member.role === "admin" && (
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
          {nonOwners.length > 10 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {!pmShowAll && Math.ceil(nonOwners.length / 10) > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <Button variant="outline" size="sm" disabled={pmPage === 1} onClick={() => setPmPage((p) => p - 1)} className="h-8 px-3 text-xs">上一页</Button>
                  {Array.from({ length: Math.ceil(nonOwners.length / 10) }, (_, i) => i + 1).map((p) => (
                    <Button key={p} size="sm" variant={p === pmPage ? "default" : "outline"} onClick={() => setPmPage(p)} className={`h-8 w-8 p-0 text-xs${p === pmPage ? " bg-[#007AFF] hover:bg-[#0066DD] border-[#007AFF]" : ""}`}>{p}</Button>
                  ))}
                  <Button variant="outline" size="sm" disabled={pmPage === Math.ceil(nonOwners.length / 10)} onClick={() => setPmPage((p) => p + 1)} className="h-8 px-3 text-xs">下一页</Button>
                </div>
              )}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8" onClick={() => { setPmShowAll((v) => !v); if (pmShowAll) setPmPage(1); }}>
                {pmShowAll ? "收起" : `展开全部（共 ${nonOwners.length} 人）`}
              </Button>
            </div>
          )}
        </>
      )}
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
