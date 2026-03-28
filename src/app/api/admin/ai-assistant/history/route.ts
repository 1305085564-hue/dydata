import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor, toTrimmedString } from "../_shared";

function toPositiveInt(value: string, fallback: number) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, actor } = auth;
  const { searchParams } = new URL(request.url);

  const limit = Math.min(toPositiveInt(searchParams.get("limit") ?? "20", 20), 100);
  const offset = toPositiveInt(searchParams.get("offset") ?? "0", 0);
  const actionType = toTrimmedString(searchParams.get("actionType"));
  const startDate = toTrimmedString(searchParams.get("startDate"));
  const endDate = toTrimmedString(searchParams.get("endDate"));

  let query = supabase
    .from("admin_actions")
    .select("id, admin_id, action_type, description, result, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actor.role === "admin") {
    query = query.eq("admin_id", actor.userId);
  }
  if (actionType) {
    query = query.eq("action_type", actionType);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    query = query.gte("created_at", `${startDate}T00:00:00.000Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const adminIds = Array.from(new Set((data ?? []).map((row) => row.admin_id).filter(Boolean)));
  const { data: profiles } = adminIds.length
    ? await supabase.from("profiles").select("id, name").in("id", adminIds)
    : { data: [] as Array<{ id: string; name: string | null }> };

  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.name ?? "未知管理员"]));

  return NextResponse.json({
    actions: (data ?? []).map((row) => ({
      id: row.id,
      adminName: nameMap.get(row.admin_id) ?? "未知管理员",
      actionType: row.action_type,
      description: row.description,
      result: row.result,
      createdAt: row.created_at,
    })),
    total: count ?? 0,
  });
}
