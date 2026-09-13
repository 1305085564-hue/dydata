import type { NextRequest } from "next/server";
import { isUuidLike, startWritingClaim } from "@/lib/topics/service";
import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuidLike(id)) return jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" });
  // V3：开始写作（幂等，允许多人同时写同一题），端点名保留以兼容前端调用
  const result = await startWritingClaim(auth.context.supabase, auth.context.userId, id);
  return jsonResult(result);
}
