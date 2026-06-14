import type { NextRequest } from "next/server";

import { createYikePerson, listYikePeople } from "@/lib/yike/service";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../_shared";

export async function GET() {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  try {
    const result = await listYikePeople(auth.actor);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ people: result.data });
  } catch (error) {
    return jsonInternalError(error, "读取负责人失败");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const result = await createYikePerson(auth.actor, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ person: result.data }, { status: 201 });
  } catch (error) {
    return jsonInternalError(error, "创建负责人失败");
  }
}
