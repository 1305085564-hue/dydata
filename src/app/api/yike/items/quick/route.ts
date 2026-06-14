import type { NextRequest } from "next/server";

import { quickCreateYikeItem } from "@/lib/yike/service";
import { loadYikeWorkbench } from "@/lib/yike/read-model";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../../_shared";

export async function POST(request: NextRequest) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const result = await quickCreateYikeItem(auth.actor, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    const workbench = await loadYikeWorkbench(auth.actor);
    return Response.json({ item: result.data, workbench }, { status: 201 });
  } catch (error) {
    return jsonInternalError(error, "快速创建事项失败");
  }
}
