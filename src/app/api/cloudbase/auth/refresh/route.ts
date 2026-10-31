import { NextRequest, NextResponse } from "next/server";

import { refreshCloudBaseSession } from "@/lib/cloudbase/auth";
import { clearCloudBaseCookies, getCloudBaseCookieSession, rejectUntrustedCloudBaseWrite, setCloudBaseCookie } from "@/app/api/cloudbase/_shared";

export async function POST(request: NextRequest) {
  const rejected = rejectUntrustedCloudBaseWrite(request);
  if (rejected) return rejected;
  const session = getCloudBaseCookieSession(request);
  if (!session) return NextResponse.json({ error: "没有可续期的登录状态" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await refreshCloudBaseSession(session);
    const response = NextResponse.json({ user: result.user }, { headers: { "Cache-Control": "no-store" } });
    setCloudBaseCookie(response, request, result.session);
    return response;
  } catch (error) {
    const status = error instanceof Error && "status" in error && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 503;
    const response = NextResponse.json({
      error: status === 401 ? "登录状态已失效" : "暂时无法续期登录状态",
      code: status === 401 ? "invalid_session" : "cloudbase_unavailable",
    }, { status: status === 401 ? 401 : 503, headers: { "Cache-Control": "no-store" } });
    if (status === 401) clearCloudBaseCookies(response);
    return response;
  }
}
