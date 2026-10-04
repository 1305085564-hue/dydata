import type { NextRequest } from "next/server";
import { isUuidLike } from "@/lib/topics/domain";
import { cancelWritingClaim } from "@/lib/topics/data";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  return observeMutationRequest("/api/topics/sub-topics/[id]/return", _request, async (observation) => {
    observation.mark("auth");
    const auth = await requireActiveTeamContext();
    if (!auth.ok) return appendObservedMutationResult(auth.response, observation);

    observation.mark("validate");
    const { id } = await context.params;
    if (!isUuidLike(id)) {
      return appendObservedMutationResult(jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" }), observation);
    }
    // V3：手动取消写作状态（幂等），端点名保留以兼容前端调用
    let response: Response;
    try {
      observation.mark("write-request");
      response = jsonResult(await cancelWritingClaim(auth.context.supabase, auth.context.userId, id));
    } catch {
      response = Response.json({ error: "取消写作失败" }, { status: 500 });
    }
    observation.mark("finalize");
    return appendObservedMutationResult(response, observation);
  });
}
