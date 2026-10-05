import type { NextRequest } from "next/server";
import { createSubTopic } from "@/lib/topics/data";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { jsonResult, requireActiveTeamContext } from "../_shared";

export type SubTopicsRouteDeps = {
  requireActiveTeamContext: typeof requireActiveTeamContext;
  createSubTopic: typeof createSubTopic;
};

export const defaultSubTopicsRouteDeps: SubTopicsRouteDeps = {
  requireActiveTeamContext,
  createSubTopic,
};

export async function buildSubTopicsResponse(
  request: Request,
  deps: SubTopicsRouteDeps = defaultSubTopicsRouteDeps,
  observation?: MutationObservation,
) {
  observation?.mark("auth");
  const auth = await deps.requireActiveTeamContext();
  if (!auth.ok) return appendObservedMutationResult(auth.response, observation);

  let body: unknown;
  try {
    observation?.mark("validate");
    body = await request.json();
  } catch {
    return appendObservedMutationResult(jsonResult({ ok: false, status: 400, message: "请求体格式不正确" }), observation);
  }

  observation?.mark("write-request");
  let response: Response;
  try {
    const result = await deps.createSubTopic(auth.context.supabase, auth.context.userId, body);
    response = jsonResult(result);
  } catch {
    response = Response.json({ error: "创建选题失败" }, { status: 500 });
  }
  observation?.mark("finalize");
  return appendObservedMutationResult(response, observation);
}

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/topics/sub-topics", request, async (observation) =>
    buildSubTopicsResponse(request, defaultSubTopicsRouteDeps, observation),
  );
}
