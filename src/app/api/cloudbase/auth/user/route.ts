import { NextRequest, NextResponse } from "next/server";

import { clearCloudBaseCookies, getCloudBaseCookieSession, inactiveCloudBaseAccountResponse, requireVerifiedCloudBaseSession, setCloudBaseCookie } from "@/app/api/cloudbase/_shared";
import { hasCloudBaseSessionChanged } from "@/lib/cloudbase/core";

export async function GET(request: NextRequest) {
  const verification = await requireVerifiedCloudBaseSession(request);
  const { result, error } = verification;
  if ("accountError" in verification) {
    const inactive = inactiveCloudBaseAccountResponse(verification.accountError);
    if (inactive) return inactive;
  }
  if (!result) {
    const blocked = error === "blocked";
    const unavailable = error === "unavailable";
    const response = NextResponse.json({
      error: blocked ? "账号已归档，请联系 owner 恢复" : unavailable ? "登录状态暂时无法确认" : "登录状态已失效",
      code: error,
    }, {
      status: unavailable ? 503 : 401,
      headers: { "Cache-Control": "no-store" },
    });
    if (!unavailable) clearCloudBaseCookies(response);
    return response;
  }
  const response = NextResponse.json({ user: result.user }, { headers: { "Cache-Control": "no-store" } });
  const current = getCloudBaseCookieSession(request);
  if (current && hasCloudBaseSessionChanged(current, result.session)) setCloudBaseCookie(response, request, result.session);
  return response;
}
