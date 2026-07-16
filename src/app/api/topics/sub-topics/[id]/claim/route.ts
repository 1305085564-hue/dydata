import type { NextRequest } from "next/server";
import { claimSubTopic } from "@/lib/topics/service";
import { jsonResult, requireTopicsContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const result = await claimSubTopic(auth.context.supabase, auth.context.userId, id);
  return jsonResult(result);
}
