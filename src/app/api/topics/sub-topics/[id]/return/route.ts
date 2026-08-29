import type { NextRequest } from "next/server";
import { cancelWritingClaim } from "@/lib/topics/service";
import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  // V3：手动取消写作状态（幂等），端点名保留以兼容前端调用
  const result = await cancelWritingClaim(auth.context.supabase, auth.context.userId, id);
  return jsonResult(result);
}
