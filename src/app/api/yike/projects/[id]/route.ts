import type { NextRequest } from "next/server";

import { updateYikeProject } from "@/lib/yike/service";

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
    const result = await updateYikeProject(auth.actor, id, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ project: result.data });
  } catch (error) {
    return jsonInternalError(error, "更新项目失败");
  }
}
