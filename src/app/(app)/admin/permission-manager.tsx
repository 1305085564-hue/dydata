"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PERMISSION_KEYS, PERMISSION_LABELS } from "@/types";
import type { Permissions, UserRole } from "@/types";
import { updatePermissions, changeRole } from "./actions";

interface MemberInfo {
  id: string;
  name: string;
  role: UserRole;
  permissions: Permissions;
}

interface PermissionManagerProps {
  members: MemberInfo[];
  currentUserId: string;
}

export function PermissionManager({ members, currentUserId }: PermissionManagerProps) {
  const [localMembers, setLocalMembers] = useState(members);
  const [isPending, startTransition] = useTransition();

  const nonOwners = localMembers.filter((m) => m.id !== currentUserId);

  function handlePermToggle(memberId: string, key: string, checked: boolean) {
    setLocalMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? { ...m, permissions: { ...m.permissions, [key]: checked } }
          : m
      )
    );

    const member = localMembers.find((m) => m.id === memberId);
    if (!member) return;

    const newPerms = { ...member.permissions, [key]: checked };

    startTransition(async () => {
      const res = await updatePermissions(memberId, newPerms);
      if (res.error) {
        toast.error(res.error);
        setLocalMembers(members);
      }
    });
  }

  function handleRoleChange(memberId: string, newRole: "member" | "admin") {
    startTransition(async () => {
      const res = await changeRole(memberId, newRole);
      if (res.error) {
        toast.error(res.error);
      } else {
        setLocalMembers((prev) =>
          prev.map((m) =>
            m.id === memberId
              ? { ...m, role: newRole, permissions: newRole === "member" ? {} : m.permissions }
              : m
          )
        );
        toast.success("角色已更新");
      }
    });
  }

  return (
    <div className="space-y-6">
      {nonOwners.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无其他成员</p>
      ) : (
        <div className="space-y-4">
          {nonOwners.map((member) => (
            <div key={member.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{member.name}</span>
                  <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                    {member.role === "admin" ? "管理员" : "成员"}
                  </Badge>
                </div>
                <Select
                  value={member.role}
                  onValueChange={(v) => handleRoleChange(member.id, v as "member" | "admin")}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="member">成员</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {member.role === "admin" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                        disabled={isPending}
                      />
                      {PERMISSION_LABELS[key]}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
