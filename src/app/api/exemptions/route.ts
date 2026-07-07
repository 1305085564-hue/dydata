import { NextRequest, NextResponse } from "next/server";

import { parseLimit, requireSignedInUser } from "@/app/api/production/_shared";

export async function GET(request: NextRequest) {
  const auth = await requireSignedInUser();
  if ("response" in auth) return auth.response;

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"), 50, 100);
  const { data, error } = await auth.supabase
    .from("exemption_request")
    .select("id, applicant_user_id, team_id, exemption_type, start_date, end_date, reason, request_status, reviewed_by, reviewed_at, created_at")
    .eq("applicant_user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message || "读取豁免申请失败" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
