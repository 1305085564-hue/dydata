import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseAuthCookie } from "@/lib/supabase-auth-cookie";
import { checkRateLimit, isRateLimitExempt } from "@/lib/rate-limit";
import { createServerClient } from "@supabase/ssr";

function createClientFromRequest(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // middleware 中不写入 cookie
        },
      },
    },
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  // 速率限制（登录注册和静态资源除外）
  if (!isRateLimitExempt(pathname)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               request.headers.get("x-real-ip") ||
               "127.0.0.1";
    const { allowed, retryAfter } = checkRateLimit(ip);
    if (!allowed) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      });
    }
  }

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

  // 有 cookie 时进一步校验 session 是否有效
  if (hasAuthCookie && (isDashboardRoute || isAdminRoute)) {
    try {
      const supabase = createClientFromRequest(request);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        // session 无效或过期，清除 cookie 并重定向到登录页
        const response = NextResponse.redirect(new URL("/login?expired=1", request.url));
        const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
          ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
          : null;
        const prefix = projectRef ? `sb-${projectRef}-auth-token` : null;
        request.cookies.getAll().forEach((cookie) => {
          if (prefix) {
            if (cookie.name === prefix || cookie.name.startsWith(`${prefix}.`)) {
              response.cookies.delete(cookie.name);
            }
          } else if (/^sb-[^-]+-auth-token(?:\.\d+)?$/.test(cookie.name)) {
            response.cookies.delete(cookie.name);
          }
        });
        return response;
      }
    } catch {
      // 校验失败时保守处理：允许通过，让页面层自行处理
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-next-pathname", pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
