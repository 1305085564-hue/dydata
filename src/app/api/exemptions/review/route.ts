import { NextResponse } from "next/server";

import {
  UUID_PATTERN,
  isRecord,
  readJsonBody,
  requireSignedInUser,
} from "@/app/api/production/_shared";
import { reviewExemptionRequestAtomically } from "@/lib/exemption-review";

type ReviewExemptionPayload = {
  requestId: string;
  action: "approved" | "rejected";
};

type ReviewExemptionDeps = {
  requireSignedInUser: typeof requireSignedInUser;
  reviewExemptionRequestAtomically: typeof reviewExemptionRequestAtomically;
};

const defaultDeps: ReviewExemptionDeps = {
  requireSignedInUser,
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

  return { data: { requestId, action } };
}

export async function buildReviewExemptionResponse(
  input: unknown,
  deps: ReviewExemptionDeps = defaultDeps,
) {
  const payload = parseReviewExemptionPayload(input);
  if ("response" in payload) return payload.response;

  const auth = await deps.requireSignedInUser();
  if ("response" in auth && auth.response) return auth.response;

  const result = await deps.reviewExemptionRequestAtomically({
    supabase: auth.supabase,
    requestId: payload.data.requestId,
    decision: payload.data.action,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;
  return buildReviewExemptionResponse(body.data);
}
