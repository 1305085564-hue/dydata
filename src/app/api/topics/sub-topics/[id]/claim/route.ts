import type { NextRequest } from "next/server";
import { isUuidLike, startWritingClaim } from "@/lib/topics/service";
import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  // 旧客户端迁移期兼容：语义已等同 start-scripting。确认部署零流量后删除本路由。
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const { error: observationError } = await auth.context.supabase.from("audit_logs").insert({
    user_id: auth.context.userId,
    action: "cleanup_observation_a21_claim",
    target: "/api/topics/sub-topics/[id]/claim",
    detail: "route_hit",
  });
  if (observationError) {
    console.warn("[cleanup-observation] A-21 route hit was not recorded", observationError.message);
  }

  const { id } = await context.params;
  if (!isUuidLike(id)) return jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" });
  const result = await startWritingClaim(auth.context.supabase, auth.context.userId, id);
  return jsonResult(result);
}
