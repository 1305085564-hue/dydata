import { NextRequest, NextResponse } from "next/server";

import { parseLimit, requireExemptionManagerActor } from "@/app/api/production/_shared";
import { loadAdminExemptionList } from "../_admin-list";

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
  return NextResponse.json({ data: result.data ?? [], count: result.data?.length ?? 0 });
}

export async function GET(request: NextRequest) {
  return buildHistoryExemptionResponse(request);
}
