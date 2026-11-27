import { NextResponse, type NextRequest } from "next/server";

import { isTrustedWrite } from "@/lib/csrf";

import { getCloudBaseInactiveAccountMessage, isCloudBaseInactiveAccountError, validateCloudBaseSession } from "@/lib/cloudbase/auth";
import { CloudBaseAuthError } from "@/lib/cloudbase/core";
import {
  CLOUD_BASE_SESSION_COOKIE,
  cloudBaseCookieOptions,
  parseCloudBaseSession,
  serializeCloudBaseSession,
} from "@/lib/cloudbase/core";
import { KEEP_LOGGED_IN_COOKIE_NAME, isKeepLoggedInCookieValue } from "@/lib/supabase/session-cookie";
import { GRANT_COOKIE_NAME, GRANT_COOKIE_PATH } from "@/lib/screenshot-grant";
import { toStringErrorResponse } from "@/lib/errors";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 来源校验统一走 src/lib/csrf.ts 的单一实现。 */
export function isTrustedCloudBaseWrite(request: NextRequest) {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) return true;
  return isTrustedWrite(request);
}

export function rejectUntrustedCloudBaseWrite(request: NextRequest) {
  return isTrustedCloudBaseWrite(request) ? null : NextResponse.json({ error: "请求来源不可信" }, { status: 403 });
}

export function getCloudBaseCookieSession(request: NextRequest) {
  return parseCloudBaseSession(request.cookies.get(CLOUD_BASE_SESSION_COOKIE)?.value);
}

export function setCloudBaseCookie(response: NextResponse, request: NextRequest, session: Parameters<typeof serializeCloudBaseSession>[0], keepLoggedIn = isKeepLoggedInCookieValue(request.cookies.get(KEEP_LOGGED_IN_COOKIE_NAME)?.value)) {
  response.cookies.set(CLOUD_BASE_SESSION_COOKIE, serializeCloudBaseSession(session), cloudBaseCookieOptions(keepLoggedIn));
}

export function clearCloudBaseCookies(response: NextResponse) {
  response.cookies.set(CLOUD_BASE_SESSION_COOKIE, "", { ...cloudBaseCookieOptions(false), maxAge: 0 });
  response.cookies.delete(KEEP_LOGGED_IN_COOKIE_NAME);
  response.cookies.set(GRANT_COOKIE_NAME, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: GRANT_COOKIE_PATH, maxAge: 0, expires: new Date(0),
  });
}

export function inactiveCloudBaseAccountResponse(
  error: unknown,
  request?: Request,
  route = "/api/cloudbase/auth",
) {
  if (!isCloudBaseInactiveAccountError(error)) return null;
  const response = toStringErrorResponse({
    code: "UNAUTHENTICATED",
    route,
    operation: "verify-active-account",
    request,
    status: 401,
    message: getCloudBaseInactiveAccountMessage(error.code),
    error,
    extraFields: { code: error.code },
  });
  response.headers.set("Cache-Control", "no-store");
  clearCloudBaseCookies(response);
  return response;
}

export async function requireVerifiedCloudBaseSession(request: NextRequest) {
  const session = getCloudBaseCookieSession(request);
  if (!session) return { result: null, error: "missing" as const };
  try {
    return { result: await validateCloudBaseSession(session), error: null };
  } catch (error) {
    if (isCloudBaseInactiveAccountError(error)) return { result: null, error: error.code, accountError: error };
    if (error instanceof CloudBaseAuthError && error.code === "user_blocked") return { result: null, error: "blocked" as const };
    return { result: null, error: error instanceof Error && "status" in error && (error as { status?: number }).status === 401 ? "invalid" as const : "unavailable" as const };
  }
}
