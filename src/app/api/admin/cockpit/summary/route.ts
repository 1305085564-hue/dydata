import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { filterScopedRows, jsonBadRequest, parseDateParam, requireAdminServiceClient, unwrapRpc } from "../_shared";

type CockpitSummary = {
  pending_videos?: number;
  pending_violations?: number;
  pending_submissions?: number;
  pending_exemptions?: number;
};

export async function GET(request: NextRequest) {
  const date = parseDateParam(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("admin_cockpit_summary", { target_date: date });
  const unwrapped = unwrapRpc<CockpitSummary>(result, "获取管理台摘要失败");
  if ("response" in unwrapped) return unwrapped.response;

  const summary = unwrapped.data ?? {};
  if (auth.scope.kind === "all") {
    return NextResponse.json(summary);
  }

  const [videosResult, submissionsResult, { data: violationRows }] = await Promise.all([
    auth.supabase.rpc("admin_pending_videos_today", { target_date: date, limit_rows: 100 }),
    auth.supabase.rpc("admin_pending_submissions_today", { target_date: date }),
    auth.supabase
      .from("violation_cases")
      .select("id, submitted_by")
      .eq("status", "submitted")
      .eq("is_deleted", false),
  ]);

  return NextResponse.json({
    pending_videos: filterScopedRows(
      auth.scope,
      videosResult.data as Array<{ submitted_by?: string | null }> | null,
      (row) => row.submitted_by,
    ).length,
    pending_violations: filterScopedRows(
      auth.scope,
      violationRows as Array<{ submitted_by?: string | null }> | null,
      (row) => row.submitted_by,
    ).length,
    pending_submissions: filterScopedRows(
      auth.scope,
      submissionsResult.data as Array<{ profile_id?: string | null }> | null,
      (row) => row.profile_id,
    ).length,
    pending_exemptions: Number(summary.pending_exemptions ?? 0),
  });
}
