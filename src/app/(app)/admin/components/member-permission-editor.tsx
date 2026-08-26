"use client";

import { Building2, Users, User, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  PERMISSION_CATEGORIES,
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_KEYS,
} from "@/types";
import type { DataScope, PermissionCategory, PermissionKey, Permissions } from "@/types";
import type { PermissionManagerMember } from "../权限管理";

export interface MemberPermissionEditorProps {
  member: PermissionManagerMember;
  draftPermissions: Permissions;
  draftDataScope: DataScope;
  onTogglePermission: (key: PermissionKey, checked: boolean) => void;
  onToggleCategory: (category: PermissionCategory) => void;
  onToggleAllPermissions?: () => void;
  onChangeDataScope: (scope: DataScope) => void;
  canEdit?: boolean;
  isSaving?: boolean;
}


const DATA_SCOPE_OPTIONS: Array<{
  value: DataScope;
  label: string;
  sublabel: string;
  icon: typeof User;
}> = [
  {
    value: "self",
    label: "仅自己",
    sublabel: "仅查看和统计个人数据",
    icon: User,
  },
  {
    value: "team",
    label: "同团队",
    sublabel: "可查看所属团队全体数据",
    icon: Users,
  },
  {
    value: "all",
    label: "全公司",
    sublabel: "跨团队查看全公司数据",
    icon: Building2,
  },
];

export function MemberPermissionEditor({
  member,
  draftPermissions,
  draftDataScope,
  onTogglePermission,
  onToggleCategory,
  onToggleAllPermissions,
  onChangeDataScope,
  canEdit = true,
  isSaving = false,
}: MemberPermissionEditorProps) {
  const isOwner = member.role === "owner";
  const isDisabled = isOwner || !canEdit || isSaving;

  const categories = Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[];
  const isAllPermissionsChecked = PERMISSION_KEYS.every((k) => draftPermissions[k] === true);

  return (
    <div className="space-y-8">
      {isOwner && (
        <div className="flex items-center gap-2 rounded-lg border border-[#E5E0D6]/80 bg-[#FBF9F5] px-3 py-2 text-[12px] text-[#78716C]">
          <Info className="size-4 shrink-0 text-[#78716C]" />
          <span>超管拥有全站最高权限，无需单独配置</span>
        </div>
      )}

      {/* 板块一：数据范围 (Data Scope) */}
      <section className="space-y-4">
        <h4 className="text-[14px] font-medium text-[#1C1917]">数据范围</h4>

        <div className="bg-[#F5F3EE]/70 p-0.5 rounded-lg grid grid-cols-3 gap-1">
          {DATA_SCOPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = draftDataScope === option.value;

            return (
              <button
                key={option.value}
                type="button"
                disabled={isDisabled}
                title={option.sublabel}
                onClick={() => !isDisabled && onChangeDataScope(option.value)}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-center transition-colors duration-100 relative",
                  isSelected
                    ? "bg-white text-[#1C1917] shadow-xs border border-[#E5E0D6]/80 font-medium"
                    : "text-[#292524] hover:text-[#1C1917] hover:bg-[#E5E0D6]/50",
                  isDisabled && "opacity-60 cursor-not-allowed"
                )}
              >
                <Icon className={cn("size-3.5", isSelected ? "text-[#1C1917]" : "text-[#78716C]")} />
                <span className="text-[13px] font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 板块二：功能权限 (Functional Permissions) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-[14px] font-medium text-[#1C1917]">功能权限</h4>

          {!isDisabled && onToggleAllPermissions && (
            <button
              type="button"
              onClick={onToggleAllPermissions}
              className="text-[12px] font-medium text-[#78716C] hover:text-[#1C1917] transition-colors shrink-0"
            >
              {isAllPermissionsChecked ? "取消全选" : "全选所有权限"}
            </button>
          )}
        </div>

        <div className="space-y-5">
          {categories.map((category) => {
            const categoryLabel = PERMISSION_CATEGORY_LABELS[category];
            const keys = PERMISSION_CATEGORIES[category];
            const enabledCount = keys.filter((k) => draftPermissions[k] === true).length;
            const allChecked = enabledCount === keys.length;

            return (
              <div
                key={category}
                className="space-y-2"
              >
                {/* 类别标头 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#78716C]">{categoryLabel}</span>
                    <span className="text-[12px] font-medium text-[#78716C] bg-[#F5F3EE] px-1.5 py-0.5 rounded-md">
                      {enabledCount} / {keys.length} 已开启
                    </span>
                  </div>

                  {!isDisabled && (
                    <button
                      type="button"
                      onClick={() => onToggleCategory(category)}
                      className="text-[12px] font-medium text-[#78716C] hover:text-[#292524] transition-colors"
                    >
                      {allChecked ? "取消全选" : "全选本类"}
                    </button>
                  )}
                </div>

                {/* 该类别下的权限 Checkbox 列表（轻量矩阵排版） */}
                <div className="grid grid-cols-3 gap-1.5">
                  {keys.map((key) => {
                    const isChecked = draftPermissions[key] === true;
                    const label = PERMISSION_LABELS[key];
                    const desc = PERMISSION_DESCRIPTIONS[key];
                    const checkboxId = `perm-cb-${member.id}-${key}`;

                    return (
                      <label
                        key={key}
                        htmlFor={checkboxId}
                        title={desc || undefined}
                        className={cn(
                          "flex items-center gap-2 h-8 px-2.5 rounded-md transition-colors duration-100 select-none cursor-pointer border",
                          isChecked
                            ? isOwner
                              ? "bg-[#F5F3EE]/80 border-transparent text-[#292524] cursor-not-allowed"
                              : "bg-[#F5F3EE] border-[#E5E0D6]/60 text-[#1C1917] font-medium"
                            : "bg-transparent border-transparent hover:bg-[#FBF9F5] text-[#292524]",
                          isDisabled && !isOwner && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={isChecked}
                          disabled={isDisabled}
                          onCheckedChange={(checked) => onTogglePermission(key, checked === true)}
                          className="shrink-0 size-3.5"
                        />
                        <span className="text-[13px] font-medium text-[#1C1917] truncate">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
