import type { NextRequest } from "next/server";

import { createYikeProject, listYikeProjects } from "@/lib/yike/service";

import { jsonInternalError, jsonYikeError, readJsonBody, requireYikeActor } from "../_shared";

export async function GET() {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  try {
    const result = await listYikeProjects(auth.actor);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ projects: result.data });
  } catch (error) {
    return jsonInternalError(error, "读取项目失败");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const result = await createYikeProject(auth.actor, body.body);
    if (!result.ok) return jsonYikeError(result.error);
    return Response.json({ project: result.data }, { status: 201 });
  } catch (error) {
    return jsonInternalError(error, "创建项目失败");
  }
}
