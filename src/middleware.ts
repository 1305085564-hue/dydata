import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseAuthCookie, listSupabaseAuthCookieNames } from "@/lib/supabase-auth-cookie";
import { checkRateLimit, isRateLimitExempt } from "@/lib/rate-limit";
import { createServerClient } from "@supabase/ssr";
import {
  applyAuthCookieLifetime,
  isKeepLoggedInCookieValue,
  KEEP_LOGGED_IN_COOKIE_NAME,
} from "@/lib/supabase/session-cookie";

const SITE_CLEARED_COOKIE = "dydata-site-cleared";
const CLEAR_SITE_DATA_QUERY = "__clear_site_data";

function createClientFromRequest(request: NextRequest, response: NextResponse) {
  const keepLoggedIn = isKeepLoggedInCookieValue(request.cookies.get(KEEP_LOGGED_IN_COOKIE_NAME)?.value);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = applyAuthCookieLifetime(options, keepLoggedIn);
            request.cookies.set(name, value);
            response.cookies.set(name, value, cookieOptions);
          });
        },
      },
    },
  );
}

function buildClearSiteDataResponse(request: NextRequest) {
  const nextUrl = request.nextUrl.clone();
  nextUrl.searchParams.set(CLEAR_SITE_DATA_QUERY, "1");
  const response = NextResponse.redirect(nextUrl);
  response.headers.set("Clear-Site-Data", "\"cache\", \"storage\"");
  response.cookies.set(SITE_CLEARED_COOKIE, "1", {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

function getProtectedReturnPath(request: NextRequest) {
  const nextUrl = request.nextUrl.clone();
  nextUrl.searchParams.delete(CLEAR_SITE_DATA_QUERY);
  const search = nextUrl.searchParams.toString();
  return `${nextUrl.pathname}${search ? `?${search}` : ""}`;
}

function buildLoginRedirect(request: NextRequest, options: { expired?: boolean } = {}) {
  const loginUrl = new URL("/login", request.url);
  if (options.expired) loginUrl.searchParams.set("expired", "1");
  loginUrl.searchParams.set("next", getProtectedReturnPath(request));
  return NextResponse.redirect(loginUrl);
}



export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isGrowthRoute = pathname === "/growth" || pathname.startsWith("/growth/");
  const isViolationsRoute = pathname === "/violations" || pathname.startsWith("/violations/");
  const isVideoReviewRoute = pathname === "/video-review" || pathname.startsWith("/video-review/");
  const isContentToolsRoute = pathname === "/content-tools" || pathname.startsWith("/content-tools/");
  const isProtectedAppRoute = isDashboardRoute || isAdminRoute || isGrowthRoute || isViolationsRoute || isVideoReviewRoute || isContentToolsRoute;
  const hasClearedSiteData = request.cookies.get(SITE_CLEARED_COOKIE)?.value === "1";
  const isClearSiteDataPass = request.nextUrl.searchParams.get(CLEAR_SITE_DATA_QUERY) === "1";

  if (process.env.NODE_ENV === "development") {
    // 本地开发模式下免除 Clear-Site-Data 校验，避免 headless 浏览器下的重定向死循环
  } else if (!hasClearedSiteData && !isClearSiteDataPass) {
    return buildClearSiteDataResponse(request);
  }

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
  const allSupabaseAuthCookieNames = listSupabaseAuthCookieNames(request.cookies.getAll());
  const hasLegacySupabaseAuthCookie = !hasAuthCookie && allSupabaseAuthCookieNames.length > 0;

  // AI 配置中心统一由 ai-config 承载

  // 首页已改为落地页，不再自动跳转；已登录用户通过页面内逻辑跳转
  // if (pathname === "/") { ... }

  if (!hasAuthCookie && isProtectedAppRoute) {
    const response = buildLoginRedirect(request, { expired: hasLegacySupabaseAuthCookie });
    if (hasLegacySupabaseAuthCookie) {
      allSupabaseAuthCookieNames.forEach((cookieName) => {
        response.cookies.delete(cookieName);
      });
    }
    response.cookies.delete(KEEP_LOGGED_IN_COOKIE_NAME);
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-next-pathname", pathname);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 有 cookie 时进一步校验 session 是否有效
  if (hasAuthCookie && isProtectedAppRoute) {
    try {
      const supabase = createClientFromRequest(request, response);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        // session 无效或过期，清除 cookie 并重定向到登录页
        const response = buildLoginRedirect(request, { expired: true });
        listSupabaseAuthCookieNames(request.cookies.getAll()).forEach((cookieName) => {
          response.cookies.delete(cookieName);
        });
        response.cookies.delete(KEEP_LOGGED_IN_COOKIE_NAME);
        return response;
      }
    } catch {
      // 校验失败时保守处理：允许通过，让页面层自行处理
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/admin/:path*",
    "/growth/:path*",
    "/violations/:path*",
    "/video-review/:path*",
    "/content-tools/:path*",
    "/login",
    "/register",
  ],
};
