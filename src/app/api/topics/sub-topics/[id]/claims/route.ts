import type { NextRequest } from "next/server";

import { loadSubTopicClaimActivity } from "@/lib/topics/service";

import { jsonResult, requireTopicsContext } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const result = await loadSubTopicClaimActivity(auth.context.supabase, id, auth.context.permissionContext.scope);
  return jsonResult(result);
}
