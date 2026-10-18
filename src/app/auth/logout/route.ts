import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GRANT_COOKIE_NAME, GRANT_COOKIE_PATH } from "@/lib/screenshot-grant";

/**
 * GET /auth/logout — 清除登录态并跳转到首页
 * 用途：NavBar 崩溃时仍可通过地址栏退出
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  response.cookies.set(GRANT_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GRANT_COOKIE_PATH,
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
