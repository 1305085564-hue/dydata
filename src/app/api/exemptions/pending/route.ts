import { NextRequest, NextResponse } from "next/server";

import { parseLimit, requireExemptionManagerActor } from "@/app/api/production/_shared";
import { loadAdminExemptionList } from "../_admin-list";
import { loadFulfillmentAppealRows } from "../_fulfillment-appeals";

type PendingDeps = {
  requireExemptionManagerActor: typeof requireExemptionManagerActor;
  loadAdminExemptionList: typeof loadAdminExemptionList;
};

const defaultDeps: PendingDeps = {
  requireExemptionManagerActor,
  loadAdminExemptionList,
};

export async function buildPendingExemptionResponse(
  request: NextRequest,
  deps: PendingDeps = defaultDeps,
) {
  const auth = await deps.requireExemptionManagerActor();
  if ("response" in auth) return auth.response;

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 100, 200);
  const result = await deps.loadAdminExemptionList({
    supabase: auth.adminSupabase,
    statuses: ["pending"],
    limit,
    visibleUserIds: auth.scope.kind === "all" ? null : (auth.scope.activeVisibleUserIds ?? auth.scope.visibleUserIds),
  });

  if ("response" in result) return result.response;
  const appeals = await loadFulfillmentAppealRows({
    supabase: auth.adminSupabase,
    statuses: ["pending"],
    limit,
    visibleUserIds: auth.scope.kind === "all" ? null : (auth.scope.activeVisibleUserIds ?? auth.scope.visibleUserIds),
  });
  if (appeals.error) return NextResponse.json({ error: "读取补交申诉列表失败" }, { status: 500 });
  const data = [...(result.data ?? []), ...(appeals.rows ?? [])]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, limit);
  return NextResponse.json({ data, count: data.length });
}

export async function GET(request: NextRequest) {
  return buildPendingExemptionResponse(request);
}
