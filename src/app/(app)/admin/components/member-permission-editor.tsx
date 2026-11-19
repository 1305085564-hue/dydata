"use client";

import { Eye, ListChecks } from "lucide-react";

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
  if (!companyRole) return "身份记录有冲突，系统没法判断他能看什么，请联系管理员处理";
  if (companyRole === "company_owner") return "本团队的数据，可查看并管理";
  if (companyRole === "admin") return "本团队的数据；可管理本团队全部成员";
  return "只看自己的数据";
}

/**
 * 成员抽屉里的「能做的事」：只读说明。看得到哪些数据、能用哪些功能，都跟着身份走（按角色自动派生），
 * 这里不提供单独开关；要调整就改身份。
 */
export function MemberPermissionEditor({
  member,
  draftPermissions,
}: MemberPermissionEditorProps) {
  const companyRole = resolveMemberPermissionEditorRole(member);
  const isOwner = companyRole === "company_owner";

  const categories = Object.keys(PERMISSION_CATEGORIES) as PermissionCategory[];
  const allKeys = categories.flatMap((category) => PERMISSION_CATEGORIES[category]);
  const enabledCount = allKeys.filter((key) => draftPermissions[key] === true).length;

  return (
    <div className="divide-y divide-[#E2E2DF]/60">
      <div className="flex min-h-9 items-start justify-between gap-3 py-2">
        <span className="flex shrink-0 items-center gap-2 text-[14px] text-[#1F1E1D]">
          <Eye className="size-3.5 text-[#78716C]" aria-hidden="true" />
          看得到
        </span>
        <span className="text-right text-[14px] text-[#1F1E1D]">{describeDerivedDataScope(member)}</span>
      </div>

      {isOwner ? (
        <p className="py-2 text-[14px] text-[#78716C]">老板全站都能看、都能管，不用单独配。</p>
      ) : (
        <details className="group py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px]">
            <span className="flex items-center gap-2 text-[#1F1E1D]">
              <ListChecks className="size-3.5 text-[#78716C]" aria-hidden="true" />
              能用的功能
            </span>
            <span className="text-[#1F1E1D] tabular-nums group-hover:text-[#141413]">
              {enabledCount} / {allKeys.length} 项
              <span className="ml-1 text-[#78716C] group-open:hidden">展开</span>
              <span className="ml-1 hidden text-[#78716C] group-open:inline">收起</span>
            </span>
          </summary>
          <p className="mt-2 text-[12px] text-[#78716C]">跟着身份走，要调整就改身份。</p>
          <dl className="mt-2 space-y-2">
            {categories.map((category) => {
              const keys = PERMISSION_CATEGORIES[category];
              const enabled = keys.filter((key) => draftPermissions[key] === true);
              return (
                <div key={category} className="grid grid-cols-[5rem_1fr] gap-3 text-[14px]">
                  <dt className="text-[#78716C]">{PERMISSION_CATEGORY_LABELS[category]}</dt>
                  <dd className={cn(enabled.length > 0 ? "text-[#1F1E1D]" : "text-[#A8A29E]")}>
                    {enabled.length > 0
                      ? enabled.map((key, index) => (
                          <span key={key} title={PERMISSION_DESCRIPTIONS[key] || undefined}>
                            {index > 0 && "、"}
                            {PERMISSION_LABELS[key]}
                          </span>
                        ))
                      : "无"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </details>
      )}
    </div>
  );
}
