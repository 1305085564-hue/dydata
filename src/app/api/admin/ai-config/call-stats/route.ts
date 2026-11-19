import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSystemActor } from "../../ai-channels/_shared";

type CallStatsDeps = {
  requireSystemActor: typeof requireSystemActor;
  createAdminClient?: typeof createAdminClient;
};

export async function buildCallStatsResponse(
  deps: CallStatsDeps = { requireSystemActor },
) {
  const auth = await deps.requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await (deps.createAdminClient ?? createAdminClient)().rpc("get_ai_call_stats");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? {
    generatedAt: new Date().toISOString(),
    channels: [],
    features: [],
    recentFailures: [],
  });
}

export async function GET() {
  return buildCallStatsResponse();
}
