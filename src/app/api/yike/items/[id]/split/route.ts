import type { NextRequest } from "next/server";

import { loadYikeWorkbench } from "@/lib/yike/read-model";
import { splitYikeMemo } from "@/lib/yike/service";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../../../_shared";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const { id } = await context.params;
  try {
    const result = await splitYikeMemo(auth.actor, id, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    const workbench = await loadYikeWorkbench(auth.actor);
    return Response.json({ ...result.data, workbench }, { status: 201 });
  } catch (error) {
    return jsonInternalError(error, "拆分备忘失败");
  }
}
