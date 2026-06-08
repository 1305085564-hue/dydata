import { NextRequest, NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { runSupabaseKeepalive, type SupabaseKeepaliveResult } from "@/lib/supabase/keepalive";

export async function buildSupabaseKeepaliveResponse(
  request: NextRequest,
  deps: {
    runKeepalive: () => Promise<SupabaseKeepaliveResult>;
  } = {
    runKeepalive: () => runSupabaseKeepalive(),
  },
) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const result = await deps.runKeepalive();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "keepalive failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return buildSupabaseKeepaliveResponse(request);
}
