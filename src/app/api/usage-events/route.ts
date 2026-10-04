import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { parseUsageEventPayload } from "@/lib/usage-events/shared";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

type UsageEventsClient = Awaited<ReturnType<typeof createClient>>;

type UsageEventsDeps = {
  createClient: () => Promise<UsageEventsClient>;
};

export async function buildUsageEventResponse(
  request: Request,
  deps: UsageEventsDeps = { createClient },
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

  const supabase = await deps.createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, skipped: true }, { status: 202 });
  }

  try {
    await supabase.from("usage_events").insert({
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
