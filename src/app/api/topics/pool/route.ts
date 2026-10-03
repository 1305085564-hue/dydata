import type { NextRequest } from "next/server";
import { buildPoolQueryOptions } from "@/lib/topics/domain";
import { loadTopicPool } from "@/lib/topics/data";
import { jsonResult, requireActiveTeamContext } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const parsed = buildPoolQueryOptions(request.nextUrl.searchParams);
  if (!parsed.ok) return jsonResult(parsed);

  const result = await loadTopicPool(
    auth.context.supabase,
    auth.context.userId,
    auth.context.teamScope,
    parsed.options,
  );
  return jsonResult(result);
}
