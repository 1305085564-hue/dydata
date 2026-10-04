import type { NextRequest } from "next/server";
import { isUuidLike } from "@/lib/topics/domain";
import { loadSubTopicDetail, removeSubTopic, updateSubTopic } from "@/lib/topics/data";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
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
  return observeMutationRequest("/api/topics/sub-topics/[id]", request, async (observation) => {
    observation.mark("auth");
    const auth = await requireActiveTeamContext();
    if (!auth.ok) return appendObservedMutationResult(auth.response, observation);

    let body: unknown;
    try {
      observation.mark("validate");
      body = await request.json();
    } catch {
      return appendObservedMutationResult(jsonResult({ ok: false, status: 400, message: "请求体格式不正确" }), observation);
    }

    const { id } = await context.params;
    if (!isUuidLike(id)) {
      return appendObservedMutationResult(jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" }), observation);
    }

    observation.mark("scope");
    let response: Response;
    try {
      observation.mark("write-request");
      response = jsonResult(await updateSubTopic(auth.context.supabase, mutationActor(auth), id, body));
    } catch {
      response = Response.json({ error: "更新选题失败" }, { status: 500 });
    }
    observation.mark("finalize");
    return appendObservedMutationResult(response, observation);
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return observeMutationRequest("/api/topics/sub-topics/[id]", _request, async (observation) => {
    observation.mark("auth");
    const auth = await requireActiveTeamContext();
    if (!auth.ok) return appendObservedMutationResult(auth.response, observation);

    const { id } = await context.params;
    if (!isUuidLike(id)) {
      return appendObservedMutationResult(jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" }), observation);
    }

    observation.mark("scope");
    let response: Response;
    try {
      observation.mark("write-request");
      response = jsonResult(await removeSubTopic(auth.context.supabase, mutationActor(auth), id));
    } catch {
      response = Response.json({ error: "移出选题失败" }, { status: 500 });
    }
    observation.mark("finalize");
    return appendObservedMutationResult(response, observation);
  });
}
