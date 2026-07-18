import { NextRequest, NextResponse } from "next/server";

import { parseLimit, requireOwnerOrAdminActor } from "@/app/api/production/_shared";
import { loadAdminExemptionList } from "../_admin-list";

export async function GET(request: NextRequest) {
  const auth = await requireOwnerOrAdminActor();
  if ("response" in auth) return auth.response;

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 100, 200);
  const result = await loadAdminExemptionList({
    supabase: auth.supabase,
    statuses: ["approved", "rejected"],
    limit,
    visibleUserIds: auth.scope.kind === "all" ? null : auth.scope.visibleUserIds,
  });

  if ("response" in result) return result.response;
  return NextResponse.json({ data: result.data ?? [], count: result.data?.length ?? 0 });
}
