import type { PermissionKey, Permissions } from "@/types";

const ADMIN_ROOT_PERMISSIONS: readonly PermissionKey[] = [
  "view_conversion",
  "review_content",
  "manage_fulfillment",
  "manage_videos",
  "manage_members",
  "review_violations",
  "manage_system",
  "use_ai_assist",
];

/** Every mounted /admin page is registered here. Unknown routes fail closed. */
export const ROUTE_PERMISSIONS: Readonly<Record<string, readonly PermissionKey[]>> = {
  "/admin/settings": ["manage_system"],
  "/admin/modules": ["manage_members"],
  "/admin/content": ["review_content", "manage_videos"],
  // Legacy URL redirects into /admin/content, so it must accept the same
  // viewers before the page-level redirect can run.
  "/admin/videos": ["review_content", "manage_videos"],
  "/admin/fulfillment": ["manage_fulfillment"],
  "/admin/collaboration": ["view_analytics"],
  "/admin/ai-config": ["manage_system"],
  "/admin": ADMIN_ROOT_PERMISSIONS,
};

function matchesRoute(pathname: string, registeredPath: string) {
  if (registeredPath === "/admin") return pathname === registeredPath;
  return pathname === registeredPath || pathname.startsWith(`${registeredPath}/`);
}

/**
 * 打开单个作品复盘的只读能力（数据管理里点作品 → 作品诊断抽屉）。
 *
 * 与 `/admin/content` 页面门禁**不是同一件事**：`view_video_review` 只允许读取一条作品的
 * 复盘详情，不授予页面入口，也不激活入库 / 移出选题库等 `review_content` 写操作。
 * 范围校验由服务端另行完成（数据管理模块范围），请求参数不能扩大范围。
 */
export const WORK_VIDEO_READ_PERMISSIONS: readonly PermissionKey[] = [
  "review_content",
  "manage_videos",
  "view_video_review",
];

export function canReadWorkVideo(permissions: Permissions): boolean {
  return WORK_VIDEO_READ_PERMISSIONS.some((permission) => permissions[permission] === true);
}

export function canAccessRoute(pathname: string, permissions: Permissions): boolean {
  const registeredPath = Object.keys(ROUTE_PERMISSIONS)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => matchesRoute(pathname, candidate));

  if (!registeredPath) return false;

  const requiredPermissions = ROUTE_PERMISSIONS[registeredPath];
  return requiredPermissions.some((permission) => permissions[permission] === true);
}
