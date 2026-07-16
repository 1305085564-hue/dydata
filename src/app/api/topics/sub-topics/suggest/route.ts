import type { NextRequest } from "next/server";
import { suggestSubTopics } from "@/lib/topics/service";
import { jsonResult, requireTopicsContext } from "../../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  const title = request.nextUrl.searchParams.get("title") ?? "";
  const content = request.nextUrl.searchParams.get("content") ?? "";
  const result = await suggestSubTopics(auth.context.supabase, { title, content });
  return jsonResult(result);
}
