import { NextRequest, NextResponse } from "next/server";

import { filterScopedRows } from "../../cockpit/_shared";
import { requireAdminServiceClient, requireOwnerOrAdminRole } from "../_shared";

const APPEAL_STATUSES = new Set(["pending", "approved", "rejected"]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";
  const limitValue = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(limitValue, 200)) : 50;

  let query = auth.supabase
    .from("fulfillment_appeals")
    .select("id, user_id, record_date, reason, status, handler_id, handled_at, created_at")
    .order("created_at", { ascending: false });

  if (APPEAL_STATUSES.has(status)) {
    query = query.eq("status", status);
  }

  if (auth.scope.kind !== "all") {
    query = query.in("user_id", auth.scope.visibleUserIds);
  }

  query = query.limit(limit);

  const appealsResult = await query;
  if (appealsResult.error) {
    return NextResponse.json({ error: appealsResult.error.message || "读取履约申诉失败" }, { status: 500 });
  }

  const scopedAppeals = filterScopedRows(auth.scope, appealsResult.data, (row) => row.user_id);
  const relatedUserIds = Array.from(
    new Set(
      scopedAppeals
        .flatMap((item) => [item.user_id, item.handler_id])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const profileMap = new Map<string, { name: string | null }>();
  if (relatedUserIds.length > 0) {
    const profilesResult = await auth.supabase.from("profiles").select("id, name").in("id", relatedUserIds);
    if (profilesResult.error) {
      return NextResponse.json({ error: profilesResult.error.message || "读取申诉成员信息失败" }, { status: 500 });
    }

    for (const profile of profilesResult.data ?? []) {
      profileMap.set(profile.id, { name: profile.name ?? null });
    }
  }

  return NextResponse.json({
    appeals: scopedAppeals.map((item) => ({
      ...item,
      user_name: profileMap.get(item.user_id)?.name ?? null,
      handler_name: item.handler_id ? profileMap.get(item.handler_id)?.name ?? null : null,
    })),
  });
}
