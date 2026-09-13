import type { NextRequest } from "next/server";
import { isUuidLike, loadSubTopicDetail, removeSubTopic, updateSubTopic } from "@/lib/topics/service";
import { jsonResult, requireActiveTeamContext } from "../../_shared";
import { hasCompanyPermission } from "@/lib/permission-utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function mutationActor(auth: Extract<Awaited<ReturnType<typeof requireActiveTeamContext>>, { ok: true }>) {
  return {
    actorId: auth.context.userId,
    teamId: auth.context.teamId!,
    canReviewContent: hasCompanyPermission(
      auth.context.permissionContext.permissionInfo.companyRole,
      "review_content",
    ),
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuidLike(id)) return jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" });
  const result = await loadSubTopicDetail(
    auth.context.supabase,
    id,
    auth.context.userId,
    auth.context.teamScope,
  );
  return jsonResult(result);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResult({ ok: false, status: 400, message: "请求体格式不正确" });
  }

  const { id } = await context.params;
  if (!isUuidLike(id)) return jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" });
  const result = await updateSubTopic(auth.context.supabase, mutationActor(auth), id, body);
  return jsonResult(result);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuidLike(id)) return jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" });
  const result = await removeSubTopic(auth.context.supabase, mutationActor(auth), id);
  return jsonResult(result);
}
