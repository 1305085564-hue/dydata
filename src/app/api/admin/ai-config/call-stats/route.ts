import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { toStringErrorResponse } from "@/lib/errors";
import { requireSystemActor } from "@/lib/admin/ai-channels";

type CallStatsDeps = {
  requireSystemActor: typeof requireSystemActor;
  createAdminClient?: typeof createAdminClient;
};

export async function buildCallStatsResponse(
  deps: CallStatsDeps = { requireSystemActor },
  request?: Request,
) {
  const auth = await deps.requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await (deps.createAdminClient ?? createAdminClient)().rpc("get_ai_call_stats");
  if (error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/ai-config/call-stats",
      operation: "load-call-stats",
      request,
      error,
    });
  }

  return NextResponse.json(data ?? {
    generatedAt: new Date().toISOString(),
    channels: [],
    features: [],
    recentFailures: [],
  });
}

export async function GET(request: Request) {
  return buildCallStatsResponse(undefined, request);
}
