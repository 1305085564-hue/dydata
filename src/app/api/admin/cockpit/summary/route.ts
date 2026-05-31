import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { filterScopedRows, jsonBadRequest, parseDateParam, requireAdminServiceClient, unwrapRpc } from "../_shared";

type CockpitSummary = {
  pending_videos?: number;
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
  const visibleUserIds = auth.scope.kind === "all" ? null : auth.scope.visibleUserIds;

  const [videosResult, submissionsResult] = await Promise.all([
    auth.supabase.rpc("admin_anomaly_videos_today", {
      p_visible_user_ids: visibleUserIds,
      target_date: date,
      limit_rows: 1000,
    }),
    auth.supabase.rpc("admin_pending_submissions_today", { target_date: date }),
  ]);

  const pendingVideos = filterScopedRows(
    auth.scope,
    videosResult.data as Array<{ submitted_by?: string | null }> | null,
    (row) => row.submitted_by,
  ).length;

  if (auth.scope.kind === "all") {
    return NextResponse.json({
      pending_videos: pendingVideos,
      pending_submissions: Number(summary.pending_submissions ?? 0),
      pending_exemptions: Number(summary.pending_exemptions ?? 0),
    });
  }

  return NextResponse.json({
    pending_videos: pendingVideos,
    pending_submissions: filterScopedRows(
      auth.scope,
      submissionsResult.data as Array<{ profile_id?: string | null }> | null,
      (row) => row.profile_id,
    ).length,
    pending_exemptions: Number(summary.pending_exemptions ?? 0),
  });
}
