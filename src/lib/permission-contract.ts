/**
 * 权限契约 - 唯一真相源
 *
 * 本文件定义了整个系统的权限架构：
 * - 角色的固定权限模板
 * - 分组模式的权限集合
 * - 数据范围规则
 *
 * ⚠️ 修改本文件后必须同步：
 * 1. SQL migration 中的权限数组
 * 2. 单元测试中的权限断言
 * 3. docs/权限与安全说明.md
 */

import type { CompanyRole, PermissionKey } from "@/types";

/**
 * 所有权限键（按业务分类）
 */
export const ALL_PERMISSIONS: readonly PermissionKey[] = [
  // 经营
  "view_analytics",
  "export_data",
  "view_conversion",
  // 内容
  "review_content",
  "manage_fulfillment",
  "manage_videos",
  // 管理
  "manage_members",
  "review_violations",
  "manage_system",
  // AI
  "use_ai_copy",
  "use_ai_assist",
] as const;

/**
 * 角色权限模板（固定）
 */
export const ROLE_PERMISSIONS: Record<
  CompanyRole,
  readonly PermissionKey[]
> = {
  member: ["view_analytics", "export_data"],

  admin: [
    "view_analytics",
    "export_data",
    "view_conversion",
    "review_content",
    "manage_fulfillment",
    "manage_videos",
    "manage_members",
    "review_violations",
    "use_ai_copy",
  ],

  company_owner: [
    "view_analytics",
    "export_data",
    "view_conversion",
    "review_content",
    "manage_fulfillment",
    "manage_videos",
    "manage_members",
    "review_violations",
    "manage_system",
    "use_ai_copy",
    "use_ai_assist",
  ],
} as const;

/**
 * 分组模式权限集合（全开）
 */
export const GROUP_MODE_PERMISSIONS: readonly PermissionKey[] = [
  "view_analytics",
  "export_data",
  "view_conversion",
  "review_content",
  "manage_fulfillment",
  "manage_videos",
  "manage_members",
  "review_violations",
  "manage_system",
  "use_ai_copy",
  "use_ai_assist",
] as const;

/**
 * 数据范围规则
 */
export const DATA_SCOPE_RULES = {
  member: "self",
  admin: "team",
  company_owner: "team",
  group_mode: "all",
} as const;

/**
 * 权限契约（完整配置）
 */
export const PERMISSION_CONTRACT = {
  roles: ROLE_PERMISSIONS,
  groupMode: {
    permissions: GROUP_MODE_PERMISSIONS,
    dataScope: DATA_SCOPE_RULES.group_mode,
  },
  dataScopeRules: DATA_SCOPE_RULES,
} as const;

/**
 * 类型守卫：检查是否为有效权限键
 */
export function isPermissionKey(value: unknown): value is PermissionKey {
  return (
    typeof value === "string" &&
    ALL_PERMISSIONS.includes(value as PermissionKey)
  );
}

/**
 * 获取角色的权限集合
 */
export function getPermissionsForRole(
  role: CompanyRole,
  groupMode = false
): readonly PermissionKey[] {
  if (groupMode) {
    return GROUP_MODE_PERMISSIONS;
  }
  return ROLE_PERMISSIONS[role];
}
