import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonBadRequest, parseDateParam, requireAdminServiceClient, unwrapRpc } from "../cockpit/_shared";

type CockpitSummary = {
  pending_videos?: number;
  pending_violations?: number;
  pending_submissions?: number;
};

export async function GET(request: NextRequest) {
  const date = parseDateParam(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const supabase = auth.supabase;
  const summaryResult = await supabase.rpc("admin_cockpit_summary", { target_date: date });
  const summaryUnwrapped = unwrapRpc<CockpitSummary>(summaryResult, "获取侧边栏徽标失败");
  if ("response" in summaryUnwrapped) return summaryUnwrapped.response;

  const summary = summaryUnwrapped.data ?? {};
  const pendingVideos = Number(summary.pending_videos ?? 0);
  const pendingViolations = Number(summary.pending_violations ?? 0);
  const pendingSubmissions = Number(summary.pending_submissions ?? 0);

  const [{ data: reviewedResults }, { count: conversionHubCount }] = await Promise.all([
    supabase
      .from("ai_insight_result")
      .select("result_json")
      .eq("insight_type", "next_day_review")
      .eq("result_status", "success"),
    supabase
      .from("violation_cases")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .eq("is_deleted", false),
  ]);

  const reviewedVideoIds = new Set(
    (reviewedResults ?? [])
      .map((row) => {
        const json = row.result_json as Record<string, unknown> | null;
        return typeof json?.video_id === "string" ? json.video_id : null;
      })
      .filter((id): id is string => id !== null),
  );

  const { data: videos } = await supabase
    .from("videos")
    .select("id")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const contentCount = (videos ?? []).filter((video) => !reviewedVideoIds.has(video.id as string)).length;

  return NextResponse.json({
    cockpit: pendingVideos + pendingViolations + pendingSubmissions,
    videos: pendingVideos,
    content: contentCount,
    conversion_hub: conversionHubCount ?? pendingViolations,
    ai_channels: 0,
  });
}
