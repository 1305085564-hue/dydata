import type { NextRequest } from "next/server";

import { isUuidLike, loadSubTopicClaimActivity } from "@/lib/topics/service";

import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuidLike(id)) return jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" });
  const result = await loadSubTopicClaimActivity(auth.context.supabase, id, auth.context.teamScope);
  return jsonResult(result);
}
