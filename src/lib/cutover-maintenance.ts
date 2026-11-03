// Keep the pre-cutover middleware coverage unchanged when maintenance is off.
// The global matcher exists only so a POST/Server Action on any page cannot
// bypass the maintenance gate during an explicitly authorized cutover window.
export function isApplicationMiddlewarePath(pathname: string) {
  return ["/", "/login", "/register", "/forgot-password", "/auth/logout"].includes(pathname) ||
    ["/dashboard", "/admin", "/violations", "/content-tools", "/douyin", "/api"]
      .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function cutoverMaintenanceResponse(pathname: string, enabled = process.env.DYDATA_WRITE_FREEZE === "1") {
  if (!enabled || pathname === "/api/health") return null;
  return new Response("系统正在切换到新服务器，预计明天上午前恢复。维护期间请勿重复提交，稍后重新打开即可正常使用；如有急事请联系管理员。", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "300", "x-dydata-maintenance": "1" },
  });
}
