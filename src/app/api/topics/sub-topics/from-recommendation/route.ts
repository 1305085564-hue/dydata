import type { NextRequest } from "next/server";

import { createSubTopicFromRecommendation } from "@/lib/topics/service";

import { jsonResult, requireTopicsContext } from "../../_shared";

export async function POST(request: NextRequest) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResult({ ok: false, status: 400, message: "请求体格式不正确" });
  }

  const result = await createSubTopicFromRecommendation(auth.context.supabase, auth.context.userId, body);
  return jsonResult(result);
}
