import { NextRequest, NextResponse } from "next/server";

import { parseLimit, requireExemptionManagerActor } from "@/app/api/production/_shared";
import { isCompanyOwnerActor, loadOrphanExemptionRequests } from "@/lib/exemption-orphan";

type OrphanDeps = {
  requireExemptionManagerActor: typeof requireExemptionManagerActor;
  loadOrphanExemptionRequests: typeof loadOrphanExemptionRequests;
};

const defaultDeps: OrphanDeps = {
  requireExemptionManagerActor,
  loadOrphanExemptionRequests,
};

export async function buildOrphanExemptionResponse(
  request: NextRequest,
  deps: OrphanDeps = defaultDeps,
) {
  const auth = await deps.requireExemptionManagerActor();
  if ("response" in auth) return auth.response;

  if (!isCompanyOwnerActor(auth.actor)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const result = await deps.loadOrphanExemptionRequests({
      supabase: auth.adminSupabase,
      scope: auth.scope,
      limit: parseLimit(request.nextUrl.searchParams.get("limit"), 100, 200),
    });

    return NextResponse.json({
      data: result.data,
      count: result.count,
    });
  } catch (error) {
    console.error("[exemptions] failed to load orphan requests", error);
    return NextResponse.json({ error: "读取待归属申请失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return buildOrphanExemptionResponse(request);
}
