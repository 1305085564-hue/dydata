import type { NextRequest } from "next/server";

import { completeYikeFocusItem } from "@/lib/yike/focus";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../../_shared";

export async function POST(request: NextRequest) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const result = await completeYikeFocusItem(auth.actor, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ workbench: result.data });
  } catch (error) {
    return jsonInternalError(error, "完成当前任务失败");
  }
}
