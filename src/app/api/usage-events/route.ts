import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { parseUsageEventPayload } from "@/lib/usage-events/shared";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

type UsageEventsDeps = {
  getCurrentUserContext: typeof getCurrentUserContext;
  createAdminClient: typeof createAdminClient;
};

export const defaultUsageEventsDeps: UsageEventsDeps = { getCurrentUserContext, createAdminClient };

export async function buildUsageEventResponse(
  request: Request,
  deps: UsageEventsDeps = defaultUsageEventsDeps,
) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, skipped: true }, { status: 202 });
  }

  const parsed = parseUsageEventPayload(rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, skipped: true }, { status: 202 });
  }

  const { user } = await deps.getCurrentUserContext();

  if (!user) {
    return NextResponse.json({ ok: false, skipped: true }, { status: 202 });
  }

  try {
    await deps.createAdminClient().from("usage_events").insert({
      user_id: user.id,
      path: parsed.data.path,
      event_type: parsed.data.eventType,
    });
  } catch {
    return NextResponse.json({ ok: false, skipped: true }, { status: 202 });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/usage-events", request, async (observation) => {
    observation.mark("validate");
    const response = await buildUsageEventResponse(request);
    let succeeded = false;
    try {
      const body = await response.clone().json() as { ok?: unknown };
      succeeded = body.ok === true;
    } catch {
      succeeded = false;
    }
    if (succeeded) {
      observation.mark("write-request");
      observation.mark("finalize");
    }
    return appendObservedMutationResult(response, observation);
  });
}
