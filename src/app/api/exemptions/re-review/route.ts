import { NextResponse } from "next/server";

import {
  UUID_PATTERN,
  isRecord,
  readJsonBody,
  requireExemptionManagerActor,
} from "@/app/api/production/_shared";
import { reReviewExemptionRequestAtomically } from "@/lib/exemption-review";

type ReReviewPayload = {
  requestId: string;
  action: "approved" | "rejected";
};

type ReReviewDeps = {
  requireExemptionManagerActor: typeof requireExemptionManagerActor;
  reReviewExemptionRequestAtomically: typeof reReviewExemptionRequestAtomically;
};

const defaultDeps: ReReviewDeps = {
  requireExemptionManagerActor,
  reReviewExemptionRequestAtomically,
};

function parseReReviewPayload(input: unknown): { data: ReReviewPayload } | { response: NextResponse } {
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

export async function buildReReviewExemptionResponse(
  input: unknown,
  deps: ReReviewDeps = defaultDeps,
) {
  const payload = parseReReviewPayload(input);
  if ("response" in payload) return payload.response;

  const auth = await deps.requireExemptionManagerActor();
  if ("response" in auth && auth.response) return auth.response;

  // 改判必须复用登录会话调用受限 RPC（service-role 调用 auth.uid() 保护
  // 的原子 RPC 会 42501 失败）；服务端管理客户端只用于直接表查询。
  const result = await deps.reReviewExemptionRequestAtomically({
    supabase: auth.supabase,
    requestId: payload.data.requestId,
    decision: payload.data.action,
    groupModeTokenHash: auth.actor?.groupModeTokenHash,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;
  return buildReReviewExemptionResponse(body.data);
}
