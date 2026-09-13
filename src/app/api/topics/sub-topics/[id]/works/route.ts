import type { NextRequest } from "next/server";
import { buildWorksQueryOptions, isUuidLike, loadSubTopicWorks } from "@/lib/topics/service";
import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const parsed = buildWorksQueryOptions(request.nextUrl.searchParams);
  if (!parsed.ok) return jsonResult(parsed);

  const { id } = await context.params;
  if (!isUuidLike(id)) return jsonResult({ ok: false, status: 400, message: "选题 ID 格式不正确" });
  const result = await loadSubTopicWorks(auth.context.supabase, id, auth.context.teamScope, parsed.options);
  return jsonResult(result);
}
