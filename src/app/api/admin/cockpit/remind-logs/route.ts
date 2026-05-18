import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonBadRequest, parseDateParam, requireAdminServiceClient } from "../_shared";

export async function GET(request: NextRequest) {
  const date = parseDateParam(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const search = request.nextUrl.searchParams.get("search")?.trim() || "";
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(20, Number.parseInt(request.nextUrl.searchParams.get("pageSize") ?? "20", 10) || 20));

  try {
    let query = auth.supabase
      .from("remind_logs")
      .select("id, target_date, user_id, user_name, channel, status, is_exempted, exempt_reason, sent_at", { count: "exact" })
      .eq("target_date", date)
      .order("sent_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (search) {
      query = query.ilike("user_name", `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      // 表不存在时返回空数组
      if (error.message?.includes("remind_logs") && error.message?.includes("does not exist")) {
        return NextResponse.json({ data: [], total: 0, page, pageSize });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch {
    return NextResponse.json({ data: [], total: 0, page, pageSize });
  }
}
