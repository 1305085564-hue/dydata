import type { NextRequest } from "next/server";

import { addYikeProjectTask } from "@/lib/yike/service";

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
    const result = await addYikeProjectTask(auth.actor, id, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ item: result.data }, { status: 201 });
  } catch (error) {
    return jsonInternalError(error, "创建项目任务失败");
  }
}
