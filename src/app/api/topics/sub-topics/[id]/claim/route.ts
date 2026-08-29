import type { NextRequest } from "next/server";
import { startWritingClaim } from "@/lib/topics/service";
import { jsonResult, requireActiveTeamContext } from "../../../_shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const result = await startWritingClaim(auth.context.supabase, auth.context.userId, id);
  return jsonResult(result);
}
