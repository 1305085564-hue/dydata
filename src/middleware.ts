import { NextResponse, type NextRequest } from "next/server";
import { cutoverMaintenanceResponse, isApplicationMiddlewarePath } from "@/lib/cutover-maintenance";
import { isTrustedWrite } from "@/lib/csrf";

import { checkRateLimit, isRateLimitExempt } from "@/lib/rate-limit";
import { checkApiRateLimit, isApiRateLimitExempt, type ApiRateLimitResult } from "@/lib/api-rate-limit";
import {
  isKeepLoggedInCookieValue,
  KEEP_LOGGED_IN_COOKIE_NAME,
} from "@/lib/supabase/session-cookie";
import { hasInvalidUuidPathParameter } from "@/lib/api-path-validation";
import { validateCloudBaseSession } from "@/lib/cloudbase/auth";
import {
  CloudBaseAuthError,
  CLOUD_BASE_SESSION_COOKIE,
  cloudBaseCookieOptions,
  hasCloudBaseAuthCookie,
  hasCloudBaseSessionChanged,
  parseCloudBaseSession,
  serializeCloudBaseSession,
} from "@/lib/cloudbase/core";
import { logApiRequest, resolveRequestId } from "@/lib/api-logger";
import cloudbaserc from "../cloudbaserc.json";

const CLEAR_SITE_DATA_QUERY = "__clear_site_data";
const MEMBERSHIP_RETRY_QUERY = "__membership_retry";
const MEMBERSHIP_RETRY_AFTER_SECONDS = 15;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEV_PROD_WRITE_AUTH_PATHS = new Set([
  "/login",
  "/api/cloudbase/auth/signin",
  "/api/cloudbase/auth/signout",
  "/api/cloudbase/auth/refresh",
  // 只发浏览凭证，不写正式库。允许本机预览读取截图。
  "/api/submission-screenshots/grant",
  // 只读取依赖关系预览，不写正式库。允许本机预览检查依赖。
  "/api/admin/ai-config/check-dependencies",
]);

export function isUntrustedApiWriteRequest(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;
  return !isTrustedWrite(request);
}

export function shouldBlockDevProductionWrite(request: NextRequest, env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV !== "development") return false;
  const cloudBaseEnvId = env.CLOUDBASE_ENV_ID || env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  if (cloudBaseEnvId !== cloudbaserc.envId) return false;
  if (env.DYDATA_DEV_ALLOW_PROD_WRITE === "1") return false;
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return false;
  return !DEV_PROD_WRITE_AUTH_PATHS.has(request.nextUrl.pathname);
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

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(KEEP_LOGGED_IN_COOKIE_NAME);
  response.cookies.delete(CLOUD_BASE_SESSION_COOKIE);
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
  clearAuthCookies(response);
  return response;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function buildMembershipUnavailablePageResponse(request: NextRequest) {
  const hasRetried = request.nextUrl.searchParams.get(MEMBERSHIP_RETRY_QUERY) === "1";
  const retryUrl = request.nextUrl.clone();
  retryUrl.searchParams.set(MEMBERSHIP_RETRY_QUERY, "1");
  const retryPath = escapeHtml(`${retryUrl.pathname}${retryUrl.search}`);
  const autoRetry = hasRetried
    ? ""
    : `<meta http-equiv="refresh" content="${MEMBERSHIP_RETRY_AFTER_SECONDS};url=${retryPath}">`;
  const response = new NextResponse(
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${autoRetry}
    <title>暂时无法确认账号状态</title>
  </head>
  <body style="margin:0;background:#F7F7F6;color:#1F1E1D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <main style="box-sizing:border-box;max-width:560px;margin:0 auto;padding:20vh 24px 12vh;text-align:center">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:999px;background:#EBEBE9;color:#78716C;font-size:24px">!</div>
      <h1 style="margin:24px 0 12px;font-size:24px;line-height:1.35;font-weight:400">暂时无法确认账号状态，请稍后重试</h1>
      <p style="margin:0 auto;max-width:420px;color:#78716c;font-size:15px;line-height:1.7">系统正在恢复，请稍后重试。当前页面不会退出登录。</p>
      <button type="button" onclick="window.location.reload()" style="margin-top:28px;border:0;border-radius:999px;background:#1F1E1D;color:#FFFFFF;padding:11px 22px;font:inherit;cursor:pointer">重试</button>
      ${hasRetried ? "" : `<p style="margin:16px 0 0;color:#A8A29E;font-size:13px">${MEMBERSHIP_RETRY_AFTER_SECONDS} 秒后自动重试一次</p>`}
    </main>
  </body>
</html>`,
    { status: 503 },
  );
  response.headers.set("Content-Type", "text/html; charset=utf-8");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Retry-After", String(MEMBERSHIP_RETRY_AFTER_SECONDS));
  return response;
}

function getSafeMembershipFailureDetails(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const candidate = error as { code?: unknown; name?: unknown; status?: unknown };
  return {
    ...(typeof candidate.code === "string" ? { errorCode: candidate.code.slice(0, 64) } : {}),
    ...(typeof candidate.name === "string" ? { errorName: candidate.name.slice(0, 64) } : {}),
    ...(typeof candidate.status === "number" ? { errorStatus: candidate.status } : {}),
  };
}

function logMembershipUnavailable(
  request: NextRequest,
  options: { branch: string; startedAt: number; error?: unknown },
) {
  logApiRequest({
    requestId: resolveRequestId(request),
    route: request.nextUrl.pathname,
    method: request.method,
    status: 503,
    outcome: "membership_unavailable",
    durationMs: Math.max(0, Date.now() - options.startedAt),
    detail: {
      backend: "cloudbase",
      branch: options.branch,
      ...getSafeMembershipFailureDetails(options.error),
    },
  });
}

export function buildMembershipUnavailableResponse(
  request: NextRequest,
  options: { api: boolean },
) {
  const response = options.api
    ? NextResponse.json(
        { error: "暂时无法确认账号状态，请稍后重试" },
        { status: 503 },
      )
    : buildMembershipUnavailablePageResponse(request);
  if (options.api) response.headers.set("Retry-After", String(MEMBERSHIP_RETRY_AFTER_SECONDS));
  return response;
}

function buildApiRateLimitResponse(result: ApiRateLimitResult) {
  return NextResponse.json(
    {
      error: "请求过于频繁，请稍后再试",
      error_code: "RATE_LIMITED",
      retry_after: Math.max(1, result.retryAfter),
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, result.retryAfter)) },
    },
  );
}

async function handleCloudBaseSession(request: NextRequest, options: {
  pathname: string;
  isApiRoute: boolean;
  hasAuthCookie: boolean;
  isProtectedAppRoute: boolean;
}) {
  const { pathname, isApiRoute, hasAuthCookie, isProtectedAppRoute } = options;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-next-pathname", pathname);

  if (!hasAuthCookie || (!isApiRoute && !isProtectedAppRoute)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const rawCookie = request.cookies.get(CLOUD_BASE_SESSION_COOKIE)?.value;
  const session = parseCloudBaseSession(rawCookie);
  if (!session) return buildAccountBlockedResponse(request, { api: isApiRoute, archived: false });

  const startedAt = Date.now();
  try {
    const verified = await validateCloudBaseSession(session);
    if (hasCloudBaseSessionChanged(session, verified.session)) {
      const encoded = serializeCloudBaseSession(verified.session);
      request.cookies.set(CLOUD_BASE_SESSION_COOKIE, encoded);
      requestHeaders.set("cookie", request.cookies.toString());
    }

    if (isApiRoute && !isApiRateLimitExempt(pathname)) {
      const result = await checkApiRateLimit({ pathname, identifier: `user:${verified.user.id}` });
      if (!result.allowed) return buildApiRateLimitResponse(result);
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (hasCloudBaseSessionChanged(session, verified.session)) {
      const keepLoggedIn = isKeepLoggedInCookieValue(request.cookies.get(KEEP_LOGGED_IN_COOKIE_NAME)?.value);
      response.cookies.set(CLOUD_BASE_SESSION_COOKIE, serializeCloudBaseSession(verified.session), cloudBaseCookieOptions(keepLoggedIn));
    }
    return response;
  } catch (error) {
    if (error instanceof CloudBaseAuthError && error.status === 401) {
      return buildAccountBlockedResponse(request, { api: isApiRoute, archived: error.code === "account_archived" });
    }
    logMembershipUnavailable(request, {
      branch: "cloudbase_non_401_error",
      startedAt,
      error,
    });
    return buildMembershipUnavailableResponse(request, { api: isApiRoute });
  }
}

export async function middleware(request: NextRequest) {
  const maintenance = cutoverMaintenanceResponse(request.nextUrl.pathname, undefined, request);
  if (maintenance) return maintenance;
  if (shouldBlockDevProductionWrite(request)) {
    return new NextResponse("本机预览连的是正式数据库，只能看不能改；要改数据请到线上网站操作", { status: 403 });
  }
  if (!isApplicationMiddlewarePath(request.nextUrl.pathname)) return NextResponse.next();
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isDashboardRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isViolationsRoute = pathname === "/violations" || pathname.startsWith("/violations/");
  const isContentToolsRoute = pathname === "/content-tools" || pathname.startsWith("/content-tools/");
  const isProtectedAppRoute = isDashboardRoute || isAdminRoute || isViolationsRoute || isContentToolsRoute;
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

  // 页面速率限制（登录注册和静态资源除外；API 走下方按端点/用户限流）
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  if (!isApiRoute && !isRateLimitExempt(pathname)) {
    const { allowed, retryAfter } = checkRateLimit(ip);
    if (!allowed) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      });
    }
  }

  const hasAuthCookie = hasCloudBaseAuthCookie(request.cookies.getAll());

  // API 限流：无登录态的请求先按 IP 拦截（有登录态的在身份核验通过后按用户拦截）
  if (isApiRoute && !hasAuthCookie && !isApiRateLimitExempt(pathname)) {
    const result = await checkApiRateLimit({ pathname, identifier: `ip:${ip}` });
    if (!result.allowed) {
      return buildApiRateLimitResponse(result);
    }
  }

  if (pathname === "/" && hasAuthCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!hasAuthCookie && isProtectedAppRoute) {
    const response = buildLoginRedirect(request);
    response.cookies.delete(KEEP_LOGGED_IN_COOKIE_NAME);
    return response;
  }

  return handleCloudBaseSession(request, { pathname, isApiRoute, hasAuthCookie, isProtectedAppRoute });
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/admin/:path*",
    "/violations/:path*",
    "/content-tools/:path*",
    "/api/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/auth/logout",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
