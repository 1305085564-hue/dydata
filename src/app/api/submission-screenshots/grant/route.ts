import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import {
  GRANT_COOKIE_NAME,
  GRANT_COOKIE_PATH,
  GRANT_MAX_ALLOW_ENTRIES,
  GRANT_TTL_SECONDS,
  buildGrantValue,
} from "@/lib/screenshot-grant";

export async function POST() {
  if (process.env.SCREENSHOT_GRANT_ENABLED === "0") {
    return NextResponse.json({ error: "grant_disabled" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const permissionContext = await getCurrentPermissionContext();
  if (!permissionContext || permissionContext.permissionInfo.userId !== user.id) {
    return NextResponse.json({ error: "无权签发截图授权" }, { status: 403 });
  }

  const allow = Array.from(new Set(permissionContext.scope.visibleUserIds));
  if (allow.length > GRANT_MAX_ALLOW_ENTRIES) {
    console.info("[screenshot-grant]", JSON.stringify({ event: "grant_oversize", count: allow.length }));
    return NextResponse.json({ error: "grant_oversize" }, { status: 413 });
  }

  const exp = Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS;
  const value = buildGrantValue({ v: 1, u: user.id, allow, exp });
  if (!value) {
    console.info("[screenshot-grant]", JSON.stringify({ event: "grant_oversize", count: allow.length, encoded: true }));
    return NextResponse.json({ error: "grant_oversize" }, { status: 413 });
  }

  const response = NextResponse.json({ exp });
  response.cookies.set(GRANT_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GRANT_COOKIE_PATH,
    maxAge: GRANT_TTL_SECONDS,
  });
  console.info("[screenshot-grant]", JSON.stringify({ event: "grant_issued", count: allow.length, exp }));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GRANT_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GRANT_COOKIE_PATH,
    maxAge: 0,
    expires: new Date(0),
  });
  console.info("[screenshot-grant]", JSON.stringify({ event: "grant_cleared" }));
  return response;
}
