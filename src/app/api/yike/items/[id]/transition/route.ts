import type { NextRequest } from "next/server";

import { loadYikeWorkbench } from "@/lib/yike/read-model";
import { transitionYikeItem } from "@/lib/yike/service";
import { validateTransitionInput } from "@/lib/yike/validation";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../../../_shared";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const input = validateTransitionInput(body.body);
  if (!input.ok) return jsonYikeError(input.error);

  const { id } = await context.params;
  try {
    const result = await transitionYikeItem(auth.actor, id, input.data.toStatus);
    if (!result.ok) return jsonYikeError(result.error);
    const workbench = await loadYikeWorkbench(auth.actor);
    return Response.json({ item: result.data, workbench });
  } catch (error) {
    return jsonInternalError(error, "状态流转失败");
  }
}
