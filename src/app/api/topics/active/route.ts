import type { NextRequest } from "next/server";
import { loadActiveTopics } from "@/lib/topics/service";
import { jsonResult, requireTopicsContext } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 8);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 20) : 8;
  const result = await loadActiveTopics(auth.context.supabase, auth.context.permissionContext.scope, limit);
  return jsonResult(result);
}
