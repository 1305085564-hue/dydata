import { NextRequest, NextResponse } from "next/server";

import { parseLimit, requireExemptionManagerActor } from "@/app/api/production/_shared";
import { loadAdminExemptionList } from "../_admin-list";

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
  return NextResponse.json({ data: result.data ?? [], count: result.data?.length ?? 0 });
}

export async function GET(request: NextRequest) {
  return buildPendingExemptionResponse(request);
}
