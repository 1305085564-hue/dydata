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
    <div className="space-y-6">
      {isOwner && (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50 px-3.5 py-2.5 text-[12px] text-zinc-500">
          <Info className="size-4 shrink-0 text-zinc-400" />
          <span>超管拥有全站最高权限，无需单独配置</span>
        </div>
      )}

      {/* 板块一：数据范围 (Data Scope) */}
      <section className="space-y-3">
        <div>
          <h4 className="text-[13px] font-semibold text-zinc-900 tracking-tight">数据范围</h4>
          <p className="text-[12px] text-zinc-500 mt-0.5">决定该成员在数据分析看板与报表中可见的数据边界</p>
        </div>

        <div className="bg-zinc-100/80 p-1 rounded-xl grid grid-cols-3 gap-1 border border-zinc-200/50">
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
                  "flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-center transition-all duration-150 relative",
                  isSelected
                    ? "bg-white text-zinc-950 shadow-xs border border-zinc-200/80 font-medium"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50",
                  isDisabled && "opacity-60 cursor-not-allowed"
                )}
              >
                <Icon className={cn("size-3.5", isSelected ? "text-zinc-900" : "text-zinc-400")} />
                <span className="text-[13px] font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 板块二：功能权限 (Functional Permissions) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[13px] font-semibold text-zinc-900 tracking-tight">功能权限</h4>
            <p className="text-[12px] text-zinc-500 mt-0.5">按 4 大核心模块划分子权限，可灵活授予任何成员</p>
          </div>

          {!isDisabled && onToggleAllPermissions && (
            <button
              type="button"
              onClick={onToggleAllPermissions}
              className="text-[12px] font-medium text-[#D97757] hover:text-[#C96442] transition-colors shrink-0"
            >
              {isAllPermissionsChecked ? "取消全选" : "全选所有权限"}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {categories.map((category) => {
            const categoryLabel = PERMISSION_CATEGORY_LABELS[category];
            const keys = PERMISSION_CATEGORIES[category];
            const enabledCount = keys.filter((k) => draftPermissions[k] === true).length;
            const allChecked = enabledCount === keys.length;

            return (
              <div
                key={category}
                className="rounded-2xl border border-zinc-200/80 bg-white p-4 space-y-3 transition-colors"
              >
                {/* 类别标头 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-zinc-900">{categoryLabel}</span>
                    <span className="text-[11px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                      {enabledCount} / {keys.length} 已开启
                    </span>
                  </div>

                  {!isDisabled && (
                    <button
                      type="button"
                      onClick={() => onToggleCategory(category)}
                      className="text-[12px] font-medium text-[#D97757] hover:text-[#C96442] transition-colors"
                    >
                      {allChecked ? "取消全选" : "全选本类"}
                    </button>
                  )}
                </div>

                {/* 该类别下的权限 Checkbox 列表 */}
                <div className="grid grid-cols-3 gap-2">
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
                          "flex items-center gap-2 p-2 px-2.5 rounded-xl transition-all duration-150 select-none cursor-pointer",
                          isChecked
                            ? isOwner
                              ? "bg-zinc-100/80 text-zinc-700 cursor-not-allowed"
                              : "bg-[#D97757]/10 text-zinc-950 font-medium"
                            : "bg-white hover:bg-zinc-100/70 text-zinc-700",
                          isDisabled && !isOwner && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={isChecked}
                          disabled={isDisabled}
                          onCheckedChange={(checked) => onTogglePermission(key, checked === true)}
                          className="shrink-0"
                        />
                        <span className="text-[12px] font-medium text-zinc-900 truncate">{label}</span>
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
