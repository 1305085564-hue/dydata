"use client";

import { Building2, Users, User, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PERMISSION_CATEGORIES,
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
} from "@/types";
import type { DataScope, PermissionCategory, PermissionKey, Permissions } from "@/types";
import type { PermissionManagerMember } from "../权限管理";

export interface MemberPermissionEditorProps {
  member: PermissionManagerMember;
  draftPermissions: Permissions;
  draftDataScope: DataScope;
  onTogglePermission?: (key: PermissionKey, checked: boolean) => void;
  onToggleCategory?: (category: PermissionCategory) => void;
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
  onChangeDataScope,
  canEdit = true,
  isSaving = false,
}: MemberPermissionEditorProps) {
  const isOwner = member.role === "owner";
  const isDisabled = isOwner || !canEdit || isSaving;

  const categories = Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[];

  return (
    <div className="space-y-8">
      {isOwner && (
        <div className="flex items-center gap-2 rounded-lg border border-[#E2E2DF]/80 bg-[#F1F1F0] px-3 py-2 text-[12px] text-[#78716C]">
          <Info className="size-4 shrink-0 text-[#78716C]" />
          <span>超管拥有全站最高权限，无需单独配置</span>
        </div>
      )}

      {/* 板块一：数据范围 (Data Scope) */}
      <section className="space-y-4">
        <h4 className="text-[14px] font-medium text-[#1C1917]">数据范围</h4>

        <div className="bg-[#F1F1F0]/70 p-0.5 rounded-lg grid grid-cols-3 gap-1">
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
                    ? "bg-white text-[#1C1917] shadow-xs border border-[#E2E2DF]/80 font-medium"
                    : "text-[#292524] hover:text-[#1C1917] hover:bg-[#EBEBE9]",
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

      {/* 板块二：功能权限 (Functional Permissions) - 默认轻量折叠收纳 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[14px] font-medium text-[#1C1917]">功能权限</h4>
          <span className="text-[12px] text-[#78716C]">
            按角色固化 · 由角色身份派生
          </span>
        </div>

        <div className="rounded-xl border border-[#E2E2DF] bg-[#F1F1F0] p-3 text-[12px] text-[#78716C] leading-relaxed">
          <div className="flex items-start gap-2">
            <Info className="size-4 shrink-0 text-[#B98A54] mt-0.5" />
            <div className="flex-1">
              <span>当前采用<b>按角色固定权限模型</b>，功能由系统角色（组员 / 组长 · 管理 / 企业所有者）直接决定。如需调整功能权限，请在下方修改系统角色。</span>
            </div>
          </div>

          <details className="mt-2.5 pt-2.5 border-t border-[#E2E2DF]/60 group">
            <summary className="text-[12px] font-medium text-[#78716C] hover:text-[#1C1917] cursor-pointer list-none flex items-center justify-between transition-colors">
              <span>查看此角色包含的具体功能明细</span>
              <span className="text-[11px] text-[#D97757] group-open:rotate-180 transition-transform duration-150">▼</span>
            </summary>
            <div className="space-y-4 pt-3">
              {categories.map((category) => {
                const categoryLabel = PERMISSION_CATEGORY_LABELS[category];
                const keys = PERMISSION_CATEGORIES[category];
                const enabledCount = keys.filter((k) => draftPermissions[k] === true).length;

                return (
                  <div key={category} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[#78716C]">{categoryLabel}</span>
                      <span className="text-[11px] font-medium text-[#78716C] bg-[#F1F1F0] px-1.5 py-0.2 rounded">
                        {enabledCount} / {keys.length}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {keys.map((key) => {
                        const isChecked = draftPermissions[key] === true;
                        const label = PERMISSION_LABELS[key];
                        const desc = PERMISSION_DESCRIPTIONS[key];

                        return (
                          <div
                            key={key}
                            title={desc || undefined}
                            className={cn(
                              "flex items-center justify-between h-7 px-2 rounded-md text-[12px] border select-none transition-colors",
                              isChecked
                                ? "bg-[#F1F1F0] border-[#E2E2DF]/60 text-[#1C1917] font-medium"
                                : "bg-transparent border-[#E2E2DF]/40 text-[#A8A29E]"
                            )}
                          >
                            <span className="truncate">{label}</span>
                            <span className={cn(
                              "text-[10.5px] shrink-0 ml-1 font-normal",
                              isChecked ? "text-[#D97757]" : "text-[#A8A29E]"
                            )}>
                              {isChecked ? "✓" : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
