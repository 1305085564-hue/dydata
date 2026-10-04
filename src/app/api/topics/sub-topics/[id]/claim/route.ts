import type { NextRequest } from "next/server";
import { isUuidLike } from "@/lib/topics/domain";
import { startWritingClaim } from "@/lib/topics/data";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  return observeMutationRequest("/api/topics/sub-topics/[id]/claim", _request, async (observation) => {
    // 旧客户端迁移期兼容：语义已等同 start-scripting。确认部署零流量后删除本路由。
    observation.mark("auth");
    const auth = await requireActiveTeamContext();
    if (!auth.ok) return appendObservedMutationResult(auth.response, observation);

    const { error: observationError } = await auth.context.supabase.from("audit_logs").insert({
      user_id: auth.context.userId,
      action: "cleanup_observation_a21_claim",
      target: "/api/topics/sub-topics/[id]/claim",
      detail: "route_hit",
    });
    if (observationError) {
      console.warn("[cleanup-observation] A-21 route hit was not recorded", observationError.message);
    }

    observation.mark("validate");
    const { id } = await context.params;
    if (!isUuidLike(id)) {
      return appendObservedMutationResult(jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" }), observation);
    }

    let response: Response;
    try {
      observation.mark("write-request");
      response = jsonResult(await startWritingClaim(auth.context.supabase, auth.context.userId, id));
    } catch {
      response = Response.json({ error: "开始写作失败" }, { status: 500 });
    }
    observation.mark("finalize");
    return appendObservedMutationResult(response, observation);
  });
}
