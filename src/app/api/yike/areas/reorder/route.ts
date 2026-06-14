import type { NextRequest } from "next/server";

import { reorderYikeAreas } from "@/lib/yike/service";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../../_shared";

export async function POST(request: NextRequest) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const result = await reorderYikeAreas(auth.actor, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json(result.data);
  } catch (error) {
    return jsonInternalError(error, "领域排序失败");
  }
}
