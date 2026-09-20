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
  "/admin/videos": ["manage_videos"],
  "/admin/fulfillment": ["manage_fulfillment"],
  "/admin/collaboration": ["view_analytics"],
  "/admin/ai-config": ["manage_system"],
  "/admin": ADMIN_ROOT_PERMISSIONS,
};

function matchesRoute(pathname: string, registeredPath: string) {
  if (registeredPath === "/admin") return pathname === registeredPath;
  return pathname === registeredPath || pathname.startsWith(`${registeredPath}/`);
}

export function canAccessRoute(pathname: string, permissions: Permissions): boolean {
  const registeredPath = Object.keys(ROUTE_PERMISSIONS)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => matchesRoute(pathname, candidate));

  if (!registeredPath) return false;

  const requiredPermissions = ROUTE_PERMISSIONS[registeredPath];
  return requiredPermissions.some((permission) => permissions[permission] === true);
}
