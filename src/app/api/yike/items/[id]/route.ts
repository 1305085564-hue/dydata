import type { NextRequest } from "next/server";

import { deleteYikeItem, updateYikeItem } from "@/lib/yike/service";
import { loadYikeWorkbench } from "@/lib/yike/read-model";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../../_shared";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const { id } = await context.params;
  try {
    const result = await updateYikeItem(auth.actor, id, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    const workbench = await loadYikeWorkbench(auth.actor);
    return Response.json({ item: result.data, workbench });
  } catch (error) {
    return jsonInternalError(error, "更新事项失败");
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    const result = await deleteYikeItem(auth.actor, id);
    if (!result.ok) return jsonYikeError(result.error);
    const workbench = await loadYikeWorkbench(auth.actor);
    return Response.json({ deleted: result.data, workbench });
  } catch (error) {
    return jsonInternalError(error, "删除事项失败");
  }
}
