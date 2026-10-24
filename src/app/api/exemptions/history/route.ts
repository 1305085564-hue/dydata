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
    visibleUserIds: auth.scope.visibleUserIds,
    orderBy: "reviewed_at",
  });

  if ("response" in result) return result.response;
  const appeals = await loadFulfillmentAppealRows({
    supabase: auth.adminSupabase,
    statuses: ["approved", "rejected"],
    limit,
    visibleUserIds: auth.scope.visibleUserIds,
    orderBy: "handled_at",
  });
  if (appeals.error) return NextResponse.json({ error: "读取补交申诉历史失败" }, { status: 500 });
  // 已处理历史按审批处理时间倒序（刚处理的排最前）；老数据缺处理时间时回退申请时间
  const processedTimeOf = (item: { reviewed_at?: string | null; created_at: string }) =>
    new Date(item.reviewed_at || item.created_at).getTime();
  const data = [...(result.data ?? []), ...(appeals.rows ?? [])]
    .sort((left, right) => processedTimeOf(right) - processedTimeOf(left))
    .slice(0, limit);
  return NextResponse.json({ data, count: data.length });
}

export async function GET(request: NextRequest) {
  return buildHistoryExemptionResponse(request);
}
