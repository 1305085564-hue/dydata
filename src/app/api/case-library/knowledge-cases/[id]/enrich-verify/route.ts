import { NextResponse } from "next/server";

import { requireCaseLibraryServiceClient, unwrapCaseLibraryRpc } from "../../../_shared";

type EnrichVerifyBody = {
  hook_text?: unknown;
  body_text?: unknown;
  cta_text?: unknown;
  admin_insight?: unknown;
  original_video_id?: unknown;
  taxonomy?: unknown;
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

function normalizeTaxonomy(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      emotion: [],
      scenario: [],
      product_category: [],
    };
  }

  const raw = value as Record<string, unknown>;
  const readList = (key: "emotion" | "scenario" | "product_category") =>
    Array.isArray(raw[key])
      ? raw[key].map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
      : [];

  return {
    emotion: readList("emotion"),
    scenario: readList("scenario"),
    product_category: readList("product_category"),
  };
}

export async function buildEnrichAndVerifyKnowledgeCaseResponse(
  caseId: string,
  body: EnrichVerifyBody,
  deps: RouteDeps = defaultDeps,
) {
  const hookText = readTrimmedString(body.hook_text);
  const adminInsight = readTrimmedString(body.admin_insight);
  if (!hookText) {
    return NextResponse.json({ error: "缺少 hook_text" }, { status: 400 });
  }
  if (!adminInsight) {
    return NextResponse.json({ error: "缺少 admin_insight" }, { status: 400 });
  }

  const auth = await deps.requireCaseLibraryServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("enrich_and_verify_case", {
    p_case_id: caseId,
    p_actor_id: auth.actor.userId,
    p_hook_text: hookText,
    p_body_text: readTrimmedString(body.body_text),
    p_cta_text: readTrimmedString(body.cta_text),
    p_admin_insight: adminInsight,
    p_original_video_id: readTrimmedString(body.original_video_id),
    p_taxonomy_payload: normalizeTaxonomy(body.taxonomy),
  }) as RpcResult;

  const unwrapped = deps.unwrapCaseLibraryRpc(result, "优秀案例审核入库失败");
  if ("response" in unwrapped) return unwrapped.response;
  return NextResponse.json({ ok: true, item: unwrapped.data });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let body: EnrichVerifyBody;
  try {
    body = (await request.json()) as EnrichVerifyBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const { id } = await context.params;
  return buildEnrichAndVerifyKnowledgeCaseResponse(id, body);
}
