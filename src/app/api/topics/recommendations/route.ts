import type { NextRequest } from "next/server";

import {
  buildTopicRecommendationQueryOptions,
  generateTopicRecommendations,
} from "@/lib/topics/recommendations";

import { jsonResult, requireTopicsContext } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  const query = buildTopicRecommendationQueryOptions(request.nextUrl.searchParams);
  if (!query.ok) return jsonResult(query);

  try {
    const result = await generateTopicRecommendations({
      supabase: auth.context.supabase,
      visibleUserIds: auth.context.permissionContext.scope.kind === "all"
        ? null
        : auth.context.permissionContext.scope.visibleUserIds,
      days: query.value.days,
      accountId: query.value.accountId,
      dateColumn: "uploaded_at",
    });
    return jsonResult({ ok: true, value: result });
  } catch {
    return jsonResult({
      ok: false,
      status: 500,
      message: "生成选题建议失败",
    });
  }
}
