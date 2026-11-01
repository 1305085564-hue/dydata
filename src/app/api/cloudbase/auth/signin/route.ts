import { NextRequest, NextResponse } from "next/server";

import { signInCloudBase } from "@/lib/cloudbase/auth";
import { CloudBaseAuthError } from "@/lib/cloudbase/core";
import { inactiveCloudBaseAccountResponse, setCloudBaseCookie, rejectUntrustedCloudBaseWrite } from "@/app/api/cloudbase/_shared";
import { KEEP_LOGGED_IN_COOKIE_NAME, KEEP_LOGGED_IN_COOKIE_VALUE, KEEP_LOGGED_IN_MAX_AGE } from "@/lib/supabase/session-cookie";

export async function POST(request: NextRequest) {
  const rejected = rejectUntrustedCloudBaseWrite(request);
  if (rejected) return rejected;

  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown; keepLoggedIn?: unknown } | null;
  if (!body || typeof body.username !== "string" || typeof body.password !== "string" || body.username.length > 320 || body.password.length > 4096) {
    return NextResponse.json({ error: "账号或密码格式不正确" }, { status: 400 });
  }
  try {
    const result = await signInCloudBase(body.username, body.password);
    const response = NextResponse.json({ user: result.user }, { headers: { "Cache-Control": "no-store" } });
    const keepLoggedIn = body.keepLoggedIn === true;
    setCloudBaseCookie(response, request, result.session, keepLoggedIn);
    if (keepLoggedIn) {
      response.cookies.set(KEEP_LOGGED_IN_COOKIE_NAME, KEEP_LOGGED_IN_COOKIE_VALUE, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: KEEP_LOGGED_IN_MAX_AGE,
      });
    } else {
      response.cookies.delete(KEEP_LOGGED_IN_COOKIE_NAME);
    }
    return response;
  } catch (error) {
    const inactive = inactiveCloudBaseAccountResponse(error);
    if (inactive) return inactive;
    const status = error instanceof Error && "status" in error && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 503;
    if (error instanceof CloudBaseAuthError && error.code === "user_blocked") {
      return NextResponse.json({ error: "账号已归档，请联系 owner 恢复", code: "user_blocked" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const invalidCredentials = status >= 400 && status < 500;
    return NextResponse.json({ error: invalidCredentials ? "邮箱或密码不正确" : "暂时无法登录，请稍后重试", code: invalidCredentials ? "invalid_credentials" : "cloudbase_signin_failed" }, { status: invalidCredentials ? 401 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
