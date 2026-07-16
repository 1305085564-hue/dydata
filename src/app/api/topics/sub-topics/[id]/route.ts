import type { NextRequest } from "next/server";
import { deleteSubTopic, loadSubTopicDetail, updateSubTopic } from "@/lib/topics/service";
import { jsonResult, requireTopicsContext } from "../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const result = await loadSubTopicDetail(auth.context.supabase, id, auth.context.permissionContext.scope);
  return jsonResult(result);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResult({ ok: false, status: 400, message: "请求体格式不正确" });
  }

  const { id } = await context.params;
  const result = await updateSubTopic(auth.context.supabase, auth.context.userId, id, body);
  return jsonResult(result);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const result = await deleteSubTopic(auth.context.supabase, auth.context.userId, id);
  return jsonResult(result);
}
