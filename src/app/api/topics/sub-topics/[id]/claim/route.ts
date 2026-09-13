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

  const { id } = await context.params;
  if (!isUuidLike(id)) return jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" });
  const result = await startWritingClaim(auth.context.supabase, auth.context.userId, id);
  return jsonResult(result);
}
