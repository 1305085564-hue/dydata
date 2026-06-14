import type { NextRequest } from "next/server";

import { createYikeArea, listYikeAreas } from "@/lib/yike/service";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../_shared";

export async function GET() {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  try {
    const result = await listYikeAreas(auth.actor);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ areas: result.data });
  } catch (error) {
    return jsonInternalError(error, "读取领域失败");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const result = await createYikeArea(auth.actor, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ area: result.data }, { status: 201 });
  } catch (error) {
    return jsonInternalError(error, "创建领域失败");
  }
}
