import { NextResponse, type NextRequest } from "next/server";

import { isCloudBaseInactiveAccountError, validateCloudBaseSession } from "@/lib/cloudbase/auth";
import { CloudBaseAuthError } from "@/lib/cloudbase/core";
import {
  CLOUD_BASE_SESSION_COOKIE,
  cloudBaseCookieOptions,
  parseCloudBaseSession,
  serializeCloudBaseSession,
} from "@/lib/cloudbase/core";
import { KEEP_LOGGED_IN_COOKIE_NAME, isKeepLoggedInCookieValue } from "@/lib/supabase/session-cookie";
import { GRANT_COOKIE_NAME, GRANT_COOKIE_PATH } from "@/lib/screenshot-grant";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isTrustedCloudBaseWrite(request: NextRequest) {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) return true;
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
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

export function inactiveCloudBaseAccountResponse(error: unknown) {
  if (!isCloudBaseInactiveAccountError(error)) return null;
  const response = NextResponse.json({ error: error.message, code: error.code }, {
    status: 401, headers: { "Cache-Control": "no-store" },
  });
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
