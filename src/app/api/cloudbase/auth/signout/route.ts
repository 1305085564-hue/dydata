import { NextRequest, NextResponse } from "next/server";

import { signOutCloudBase } from "@/lib/cloudbase/auth";
import { clearCloudBaseCookies, getCloudBaseCookieSession, rejectUntrustedCloudBaseWrite } from "@/app/api/cloudbase/_shared";

export async function POST(request: NextRequest) {
  const rejected = rejectUntrustedCloudBaseWrite(request);
  if (rejected) return rejected;
  try { await signOutCloudBase(getCloudBaseCookieSession(request)); } catch { /* Local logout still clears an expired or revoked session. */ }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearCloudBaseCookies(response);
  return response;
}
