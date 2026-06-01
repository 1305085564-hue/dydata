import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/publish-drafts/api";
import { loadApprovedList } from "@/lib/publish-drafts/read-model";

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedContext();
  if (!user) {
    return jsonUnauthorized();
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const accountId = searchParams.get("account_id")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;

  let limit = 50;
  if (limitRaw) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return jsonBadRequest("limit 不合法");
    }
    limit = Math.min(parsed, 200);
  }

  const { data, errorMessage } = await loadApprovedList({
    limit,
    accountId,
    search,
  });

  if (errorMessage || !data) {
    return jsonServerError(errorMessage ?? "获取已通过列表失败");
  }

  return NextResponse.json({ data });
}
