const ADMIN_CENTER_EXCLUDED_PATHS = [
  "/admin/settings",
  "/admin/modules",
  "/admin/ai-config",
] as const;

export function isManagementPath(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

export function shouldShowAdminCenterNav(pathname: string): boolean {
  if (!isManagementPath(pathname)) return false;
  return !ADMIN_CENTER_EXCLUDED_PATHS.some((prefix) => pathname.startsWith(prefix));
}
