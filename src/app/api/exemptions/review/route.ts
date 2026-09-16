import { NextResponse } from "next/server";

import {
  UUID_PATTERN,
  isRecord,
  isValidDate,
  readJsonBody,
  requireExemptionManagerActor,
} from "@/app/api/production/_shared";
import { reviewExemptionRequestAtomically } from "@/lib/exemption-review";
import { EXEMPTION_FEEDBACK_MAX_LENGTH, validateTextBoundary } from "@/lib/input-boundaries";
import { observeMutation, type MutationObservation } from "@/lib/observed-mutation";

type ReviewExemptionPayload = {
  requestId: string;
  action: "approved" | "rejected";
  dates?: string[];
  feedback?: string | null;
};

type ReviewExemptionDeps = {
  requireExemptionManagerActor: typeof requireExemptionManagerActor;
  reviewExemptionRequestAtomically: typeof reviewExemptionRequestAtomically;
};

const defaultDeps: ReviewExemptionDeps = {
  requireExemptionManagerActor,
  reviewExemptionRequestAtomically,
};

function parseReviewExemptionPayload(input: unknown): { data: ReviewExemptionPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  const requestId = typeof input.request_id === "string" ? input.request_id.trim() : "";
  if (!UUID_PATTERN.test(requestId)) {
    return { response: NextResponse.json({ error: "request_id 必须是 uuid" }, { status: 400 }) };
  }

  const action = typeof input.action === "string" ? input.action.trim() : "";
  if (action !== "approved" && action !== "rejected") {
    return { response: NextResponse.json({ error: "action 必须是 approved 或 rejected" }, { status: 400 }) };
  }

  const dates = Array.isArray(input.dates)
    ? input.dates.filter((date): date is string => typeof date === "string" && isValidDate(date)).slice(0, 400)
    : undefined;
  if (Array.isArray(input.dates) && dates?.length !== input.dates.length) {
    return { response: NextResponse.json({ error: "dates 必须是 YYYY-MM-DD 数组" }, { status: 400 }) };
  }
  const feedbackResult = validateTextBoundary({
    label: "feedback",
    value: input.feedback,
    maxLength: EXEMPTION_FEEDBACK_MAX_LENGTH,
  });
  if (!feedbackResult.ok) {
    return { response: NextResponse.json({ error: feedbackResult.error }, { status: 400 }) };
  }
  const feedback = input.feedback == null ? undefined : feedbackResult.data;
  return { data: { requestId, action, dates, feedback } };
}

export async function buildReviewExemptionResponse(
  input: unknown,
  deps: ReviewExemptionDeps = defaultDeps,
  observation?: MutationObservation,
): Promise<NextResponse> {
  observation?.mark("validate");
  const payload = parseReviewExemptionPayload(input);
  if ("response" in payload) return payload.response;

  observation?.mark("auth");
  const auth = await deps.requireExemptionManagerActor();
  if ("response" in auth) {
    return auth.response ?? NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  observation?.mark("review-rpc");
  const result = await deps.reviewExemptionRequestAtomically({
    supabase: auth.supabase,
    requestId: payload.data.requestId,
    decision: payload.data.action,
    dates: payload.data.dates,
    feedback: payload.data.feedback,
    groupModeTokenHash: auth.actor?.groupModeTokenHash,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  observation?.mark("finalize");
  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request) {
  return observeMutation("/api/exemptions/review", async (observation) => {
    observation.mark("validate");
    const body = await readJsonBody(request);
    if ("response" in body) {
      return body.response ?? NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
    }
    return buildReviewExemptionResponse(body.data, defaultDeps, observation);
  });
}
