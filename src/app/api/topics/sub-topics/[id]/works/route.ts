import type { NextRequest } from "next/server";
import { buildWorksQueryOptions, loadSubTopicWorks } from "@/lib/topics/service";
import { jsonResult, requireTopicsContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  const parsed = buildWorksQueryOptions(request.nextUrl.searchParams);
  if (!parsed.ok) return jsonResult(parsed);

  const { id } = await context.params;
  const result = await loadSubTopicWorks(auth.context.supabase, id, auth.context.permissionContext.scope, parsed.options);
  return jsonResult(result);
}
