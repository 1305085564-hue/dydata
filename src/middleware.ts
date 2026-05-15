import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseAuthCookie } from "@/lib/supabase-auth-cookie";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const hasAuthCookie = hasSupabaseAuthCookie(
    request.cookies.getAll(),
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );

  // AI 配置中心统一由渠道页承载，旧链接继续重定向
  if (pathname === "/admin/ai-features" || pathname.startsWith("/admin/ai-features/")) {
    return NextResponse.redirect(new URL("/admin/ai-channels", request.url));
  }

  // 首页已改为落地页，不再自动跳转；已登录用户通过页面内逻辑跳转
  // if (pathname === "/") { ... }

  if (!hasAuthCookie && (isDashboardRoute || isAdminRoute)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next({
    request,
  });
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
