import type { NextRequest } from "next/server";
import { isUuidLike } from "@/lib/topics/domain";
import { startWritingClaim } from "@/lib/topics/data";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export type StartScriptingRouteDeps = {
  requireActiveTeamContext: typeof requireActiveTeamContext;
  startWritingClaim: typeof startWritingClaim;
};

export const defaultStartScriptingRouteDeps: StartScriptingRouteDeps = {
  requireActiveTeamContext,
  startWritingClaim,
};

export async function POST(_request: NextRequest, context: RouteContext) {
  return observeMutationRequest("/api/topics/sub-topics/[id]/start-scripting", _request, async (observation) =>
    buildStartScriptingResponse(_request, context, defaultStartScriptingRouteDeps, observation),
  );
}

export async function buildStartScriptingResponse(
  _request: Request,
  context: RouteContext,
  deps: StartScriptingRouteDeps = defaultStartScriptingRouteDeps,
  observation?: MutationObservation,
) {
  observation?.mark("auth");
  const auth = await deps.requireActiveTeamContext();
  if (!auth.ok) return appendObservedMutationResult(auth.response, observation);

  observation?.mark("validate");
  const { id } = await context.params;
  if (!isUuidLike(id)) {
    return appendObservedMutationResult(jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" }), observation);
  }
  // V3：开始写作（幂等，允许多人同时写同一题），端点名保留以兼容前端调用
  let response: Response;
  try {
    observation?.mark("write-request");
    response = jsonResult(await deps.startWritingClaim(auth.context.supabase, auth.context.userId, id));
  } catch {
    response = Response.json({ error: "开始写作失败" }, { status: 500 });
  }
  observation?.mark("finalize");
  return appendObservedMutationResult(response, observation);
}
