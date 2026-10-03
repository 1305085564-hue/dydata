import { NextRequest, NextResponse } from "next/server";

import { parseLimit, requireExemptionManagerActor } from "@/app/api/production/_shared";
import { loadAdminExemptionList } from "../_admin-list";
import { loadFulfillmentAppealRows } from "../_fulfillment-appeals";

type HistoryDeps = {
  requireExemptionManagerActor: typeof requireExemptionManagerActor;
  loadAdminExemptionList: typeof loadAdminExemptionList;
};

const defaultDeps: HistoryDeps = {
  requireExemptionManagerActor,
  loadAdminExemptionList,
};

export async function buildHistoryExemptionResponse(
  request: NextRequest,
  deps: HistoryDeps = defaultDeps,
) {
  const auth = await deps.requireExemptionManagerActor();
  if ("response" in auth) return auth.response;

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 50, 100);
  const result = await deps.loadAdminExemptionList({
    supabase: auth.adminSupabase,
    statuses: ["approved", "rejected"],
    limit,
    visibleUserIds: auth.scope.kind === "all" ? null : auth.scope.visibleUserIds,
  });

  if ("response" in result) return result.response;
  const appeals = await loadFulfillmentAppealRows({
    supabase: auth.adminSupabase,
    statuses: ["approved", "rejected"],
    limit,
    visibleUserIds: auth.scope.kind === "all" ? null : auth.scope.visibleUserIds,
  });
  if (appeals.error) return NextResponse.json({ error: "读取补交申诉历史失败" }, { status: 500 });
  const data = [...(result.data ?? []), ...(appeals.rows ?? [])]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, limit);
  return NextResponse.json({ data, count: data.length });
}

export async function GET(request: NextRequest) {
  return buildHistoryExemptionResponse(request);
}
