import { NextRequest, NextResponse } from "next/server";

import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonBadRequest, jsonForbidden, jsonNotFound, jsonServerError, jsonUnauthorized } from "@/lib/violations/api";

function normalizeWeekStart(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const permissions = await getUserPermissions();
  if (!permissions) return jsonUnauthorized();
  if (permissions.role !== "owner" && permissions.role !== "admin") {
    return jsonForbidden("缺少每周筛选确认权限");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonBadRequest("请求体格式不正确");
  }

  const weekStart = normalizeWeekStart(body.week_start);
  if (!weekStart) {
    return jsonBadRequest("week_start 必须是 YYYY-MM-DD");
  }

  const supabase = createAdminClient();
  const confirmedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("weekly_decisions")
    .update({
      confirmed_by: permissions.userId,
      confirmed_at: confirmedAt,
    })
    .eq("week_start", weekStart)
    .select("id, week_start, confirmed_by, confirmed_at")
    .maybeSingle();

  if (error) {
    return jsonServerError("确认每周决策失败");
  }

  if (!data) {
    return jsonNotFound("本周还没有决策草稿");
  }

  return NextResponse.json({ data });
}
