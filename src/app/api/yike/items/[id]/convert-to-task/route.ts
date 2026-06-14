import type { NextRequest } from "next/server";

import { loadYikeWorkbench } from "@/lib/yike/read-model";
import { convertYikeMemoToTask } from "@/lib/yike/service";

import { jsonInternalError, jsonYikeError, requireYikeActor } from "../../../_shared";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    const result = await convertYikeMemoToTask(auth.actor, id);
    if (!result.ok) return jsonYikeError(result.error);
    const workbench = await loadYikeWorkbench(auth.actor);
    return Response.json({ item: result.data, workbench });
  } catch (error) {
    return jsonInternalError(error, "备忘转任务失败");
  }
}
