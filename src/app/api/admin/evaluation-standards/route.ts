import { NextResponse } from "next/server";
import { requireAdminServiceClient } from "../fulfillment/_shared";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { canEditEvaluationStandards, parseEvaluationStandards } from "@/lib/evaluation-standards";
import { loadEvaluationSettings, saveEvaluationSettings } from "@/lib/evaluation-standards-store";
import { normalizeAppError } from "@/lib/errors";
import { createRequestContext } from "@/lib/request-context";
import { observeRequest } from "@/lib/observability";
import { observeMutation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, resolveObservedMutationRequestId } from "@/lib/observed-mutation-result";

const defaults = { requireAdminServiceClient, loadEvaluationSettings, saveEvaluationSettings };
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function buildEvaluationStandardsResponse(request: Request, deps = defaults) {
  try {
    const auth = await deps.requireAdminServiceClient();
    if ("response" in auth) return auth.response ?? json({ error: "无权限" }, 403);
    if (!auth.scope.teamId || !canAccessAdminPath("/admin/caliber", auth.actor.role, auth.actor.permissions)) return json({ error: "无权查看公司评价标准" }, 403);
    const canEdit = canEditEvaluationStandards(auth.actor);
    if (request.method === "GET") return json({ ...await deps.loadEvaluationSettings(auth.supabase, auth.scope.teamId), canEdit });
    if (!canEdit) return json({ error: "只有公司负责人可以修改评价标准" }, 403);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "请求来源不正确" }, 403);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "提交内容不是有效的 JSON" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "提交内容不正确" }, 400);
    const payload = body as Record<string, unknown>;
    if (Object.keys(payload).some((key) => key !== "standards" && key !== "expectedUpdatedAt")) return json({ error: "包含未知的设置字段" }, 400);
    if (payload.expectedUpdatedAt !== null && typeof payload.expectedUpdatedAt !== "string") return json({ error: "缺少评价标准版本，请刷新后重试" }, 400);
    const parsed = parseEvaluationStandards(payload.standards);
    if (!parsed.success) return json({ error: parsed.error }, 400);
    const saved = await deps.saveEvaluationSettings(auth.supabase, auth.scope.teamId, auth.actor.userId, parsed.data, payload.expectedUpdatedAt as string | null);
    return json({ ...saved, canEdit: true });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return json({ error: normalized.publicMessage, code: normalized.code }, normalized.status);
  }
}

export async function GET(request: Request) {
  return observeRequest(createRequestContext({ request, route: "/api/admin/evaluation-standards", operation: "read" }), () => buildEvaluationStandardsResponse(request));
}

export async function PUT(request: Request) {
  return observeMutation("/api/admin/evaluation-standards", async (observation) => {
    observation.mark("validate");
    const response = await buildEvaluationStandardsResponse(request);
    observation.setDetail?.({ businessSucceeded: response.ok, permissionChecked: [200, 400, 403, 409].includes(response.status), configuration: "evaluation_standards" });
    return appendObservedMutationResult(response, observation);
  }, { createRequestId: () => resolveObservedMutationRequestId(request) });
}
