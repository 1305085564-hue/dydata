import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseAuthCookie, listSupabaseAuthCookieNames } from "@/lib/supabase-auth-cookie";
import { checkRateLimit, isRateLimitExempt } from "@/lib/rate-limit";
import { createServerClient } from "@supabase/ssr";
import {
  applyAuthCookieLifetime,
  isKeepLoggedInCookieValue,
  KEEP_LOGGED_IN_COOKIE_NAME,
} from "@/lib/supabase/session-cookie";
import { hasInvalidUuidPathParameter } from "@/lib/api-path-validation";
import { resolveMembershipStatusFromQuery } from "@/lib/member-lifecycle";

const CLEAR_SITE_DATA_QUERY = "__clear_site_data";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// 飞书回调等外部服务调用的路由，豁免 CSRF 检查
const CSRF_EXEMPT_PATHS = new Set(["/api/feishu/event"]);

export function isUntrustedApiWriteRequest(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/") || !UNSAFE_METHODS.has(request.method.toUpperCase())) {
    return false;
  }

  if (CSRF_EXEMPT_PATHS.has(request.nextUrl.pathname)) {
    return false;
  }

  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    return true;
  }

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin !== request.nextUrl.origin;
  } catch {
    return true;
  }
}

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
  nextUrl.searchParams.delete(CLEAR_SITE_DATA_QUERY);
  const response = NextResponse.redirect(nextUrl);
  response.headers.set("Clear-Site-Data", "\"cache\", \"storage\"");
  return response;
}

function getProtectedReturnPath(request: NextRequest) {
  const nextUrl = request.nextUrl.clone();
  nextUrl.searchParams.delete(CLEAR_SITE_DATA_QUERY);
  const search = nextUrl.searchParams.toString();
  return `${nextUrl.pathname}${search ? `?${search}` : ""}`;
}

function buildLoginRedirect(request: NextRequest, options: { expired?: boolean; archived?: boolean } = {}) {
  const loginUrl = new URL("/login", request.url);
  if (options.expired) loginUrl.searchParams.set("expired", "1");
  if (options.archived) loginUrl.searchParams.set("archived", "1");
  loginUrl.searchParams.set("next", getProtectedReturnPath(request));
  return NextResponse.redirect(loginUrl);
}

function clearAuthCookies(response: NextResponse, request: NextRequest) {
  listSupabaseAuthCookieNames(request.cookies.getAll()).forEach((cookieName) => {
    response.cookies.delete(cookieName);
  });
  response.cookies.delete(KEEP_LOGGED_IN_COOKIE_NAME);
}

export function buildAccountBlockedResponse(
  request: NextRequest,
  options: { api: boolean; archived: boolean },
) {
  const response = options.api
    ? NextResponse.json(
        { error: options.archived ? "账号已归档，请联系 owner 恢复" : "无法确认账号状态，请重新登录" },
        { status: options.archived ? 403 : 401 },
      )
    : buildLoginRedirect(request, { expired: !options.archived, archived: options.archived });
  clearAuthCookies(response, request);
  return response;
}

export function buildMembershipUnavailableResponse(
  _request: NextRequest,
  options: { api: boolean },
) {
  const response = options.api
    ? NextResponse.json(
        { error: "暂时无法确认账号状态，请稍后重试" },
        { status: 503 },
      )
    : new NextResponse("暂时无法确认账号状态，请稍后重试", { status: 503 });
  response.headers.set("Retry-After", "15");
  return response;
}

const INVALID_AUTH_SESSION_CODES = new Set([
  "bad_jwt",
  "invalid_jwt",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_not_found",
]);

export function isInvalidAuthSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (INVALID_AUTH_SESSION_CODES.has(code)) return true;

  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token already used") ||
    message.includes("refresh token not found") ||
    message.includes("auth session missing")
  );
}



export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isGrowthRoute = pathname === "/growth" || pathname.startsWith("/growth/");
  const isViolationsRoute = pathname === "/violations" || pathname.startsWith("/violations/");
  const isContentToolsRoute = pathname === "/content-tools" || pathname.startsWith("/content-tools/");
  const isProtectedAppRoute = isDashboardRoute || isAdminRoute || isGrowthRoute || isViolationsRoute || isContentToolsRoute;
  const isClearSiteDataPass = request.nextUrl.searchParams.get(CLEAR_SITE_DATA_QUERY) === "1";

  if (isApiRoute && hasInvalidUuidPathParameter(pathname)) {
    return NextResponse.json({ error: "路径参数格式不正确" }, { status: 400 });
  }

  if (isUntrustedApiWriteRequest(request)) {
    return NextResponse.json({ error: "请求来源不可信" }, { status: 403 });
  }

  if (isClearSiteDataPass) {
    return buildClearSiteDataResponse(request);
  }

  // 速率限制（登录注册和静态资源除外）
  if (!isApiRoute && !isRateLimitExempt(pathname)) {
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

  if (pathname === "/" && hasAuthCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!hasAuthCookie && isProtectedAppRoute) {
    const response = buildLoginRedirect(request, { expired: hasLegacySupabaseAuthCookie });
    if (hasLegacySupabaseAuthCookie) clearAuthCookies(response, request);
    else response.cookies.delete(KEEP_LOGGED_IN_COOKIE_NAME);
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
  if (hasAuthCookie && (isProtectedAppRoute || isApiRoute)) {
    try {
      const supabase = createClientFromRequest(request, response);
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        if (isInvalidAuthSessionError(error)) {
          return buildAccountBlockedResponse(request, { api: isApiRoute, archived: false });
        }
        return buildMembershipUnavailableResponse(request, { api: isApiRoute });
      }
      if (!data.user) {
        // session 无效或过期，清除 cookie 并重定向到登录页
        return buildAccountBlockedResponse(request, { api: isApiRoute, archived: false });
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("membership_status")
        .eq("id", data.user.id)
        .maybeSingle();
      const membershipStatus = resolveMembershipStatusFromQuery({ data: profile, error: profileError });
      if (membershipStatus === "archived") {
        return buildAccountBlockedResponse(request, { api: isApiRoute, archived: true });
      }
      if (membershipStatus === "unavailable") {
        return buildMembershipUnavailableResponse(request, { api: isApiRoute });
      }
    } catch {
      // 无法核验状态时拒绝本次请求，但保留现有会话，避免短暂故障造成误登出。
      return buildMembershipUnavailableResponse(request, { api: isApiRoute });
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
    "/content-tools/:path*",
    "/api/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/auth/logout",
  ],
};
