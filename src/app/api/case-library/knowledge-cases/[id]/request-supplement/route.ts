import { NextResponse } from "next/server";

import { requireCaseLibraryServiceClient, unwrapCaseLibraryRpc } from "../../../_shared";

type RequestSupplementBody = {
  reason?: unknown;
  missing_fields?: unknown;
};

type RpcResult = {
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
};

type RouteDeps = {
  requireCaseLibraryServiceClient: typeof requireCaseLibraryServiceClient;
  unwrapCaseLibraryRpc: typeof unwrapCaseLibraryRpc;
};

const defaultDeps: RouteDeps = {
  requireCaseLibraryServiceClient,
  unwrapCaseLibraryRpc,
};

function readTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeMissingFields(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

export async function buildRequestKnowledgeCaseSupplementResponse(
  caseId: string,
  body: RequestSupplementBody,
  deps: RouteDeps = defaultDeps,
) {
  const reason = readTrimmedString(body.reason);
  if (!reason) {
    return NextResponse.json({ error: "缺少 reason" }, { status: 400 });
  }

  const auth = await deps.requireCaseLibraryServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("request_case_supplement", {
    p_case_id: caseId,
    p_actor_id: auth.actor.userId,
    p_reason: reason,
    p_missing_fields: normalizeMissingFields(body.missing_fields),
  }) as RpcResult;

  const unwrapped = deps.unwrapCaseLibraryRpc(result, "案例补充请求发送失败");
  if ("response" in unwrapped) return unwrapped.response;
  return NextResponse.json({ ok: true, item: unwrapped.data });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let body: RequestSupplementBody;
  try {
    body = (await request.json()) as RequestSupplementBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const { id } = await context.params;
  return buildRequestKnowledgeCaseSupplementResponse(id, body);
}
