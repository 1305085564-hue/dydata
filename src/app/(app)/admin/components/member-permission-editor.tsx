"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PERMISSION_CATEGORIES,
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
} from "@/types";
import type { CompanyRole, PermissionCategory, PermissionKey, Permissions } from "@/types";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { PermissionManagerMember } from "../权限管理";

export interface MemberPermissionEditorProps {
  member: PermissionManagerMember;
  draftPermissions: Permissions;
  onTogglePermission?: (key: PermissionKey, checked: boolean) => void;
  onToggleCategory?: (category: PermissionCategory) => void;
  onToggleAllPermissions?: () => void;
  canEdit?: boolean;
  isSaving?: boolean;
}

export function resolveMemberPermissionEditorRole(
  member: Pick<PermissionManagerMember, "role" | "company_role">,
): CompanyRole | null {
  const resolution = resolveProfileCompanyRole(member.role, member.company_role);
  return resolution.conflict ? null : resolution.companyRole;
}

function describeDerivedDataScope(member: Pick<PermissionManagerMember, "role" | "company_role">) {
  const companyRole = resolveMemberPermissionEditorRole(member);
  if (!companyRole) return "角色字段冲突或无效，已停止基于角色推导权限";
  if (companyRole === "company_owner") return "老板：查看本公司数据；开启集团模式后可查看全部公司";
  if (companyRole === "admin") return "组长：查看本公司数据；可管理本公司全部成员";
  return "组员：仅查看自己的数据";
}

export function MemberPermissionEditor({
  member,
  draftPermissions,
}: MemberPermissionEditorProps) {
  const companyRole = resolveMemberPermissionEditorRole(member);
  const isOwner = companyRole === "company_owner";

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
      <section className="rounded-xl bg-[#F7F7F6] border border-[#E2E2DF] p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[13px] font-medium text-[#1C1917]">数据范围</h4>
          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-[#78716C] border border-[#E2E2DF]">
            按角色自动派生
          </span>
        </div>
        <p className="text-[12px] text-[#78716C] leading-relaxed">
          数据范围由系统角色自动决定，页面不再提供单独保存入口。
          <br />
          {describeDerivedDataScope(member)}
        </p>
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
