import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { filterScopedRows, jsonBadRequest, parseDateParam, requireAdminServiceClient, unwrapRpc } from "../cockpit/_shared";

type CockpitSummary = {
  pending_videos?: number;
  pending_submissions?: number;
  pending_violations?: number;
};

type PendingViolationBadgeRow = {
  id: string;
  submitted_by: string | null;
};

type SidebarBadgesDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
};

type SidebarBadgesPayload = {
  cockpit: number;
  videos: number;
  content: number;
  conversion_hub: number;
  ai_channels: number;
};

const SIDEBAR_BADGES_CACHE_TTL_MS = 60_000;
const sidebarBadgesCache = new Map<string, { expiresAt: number; payload: SidebarBadgesPayload }>();

function getCacheKey(input: {
  date: string;
  userId: string;
  scopeKind: string;
  visibleUserIds: string[];
}) {
  return [
    input.date,
    input.userId,
    input.scopeKind,
    [...input.visibleUserIds].sort().join(","),
  ].join("|");
}

export async function buildSidebarBadgesResponse(
  request: NextRequest,
  deps: SidebarBadgesDeps = { requireAdminServiceClient },
) {
  const date = parseDateParam(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const auth = await deps.requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const supabase = auth.supabase;
  const cacheKey = getCacheKey({
    date,
    userId: auth.scope.userId,
    scopeKind: auth.scope.kind,
    visibleUserIds: auth.scope.visibleUserIds,
  });
  const cached = sidebarBadgesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  const summaryResult = await supabase.rpc("admin_cockpit_summary", { target_date: date });
  const summaryUnwrapped = unwrapRpc<CockpitSummary>(summaryResult, "获取侧边栏徽标失败");
  if ("response" in summaryUnwrapped) return summaryUnwrapped.response;

  const summary = summaryUnwrapped.data ?? {};
  const pendingVideos = Number(summary.pending_videos ?? 0);
  const pendingSubmissions = Number(summary.pending_submissions ?? 0);
  const pendingViolations = Number(summary.pending_violations ?? 0);
  const recentReviewWindowStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: reviewedResults }, pendingRowsResult] = await Promise.all([
    supabase
      .from("ai_insight_result")
      .select("result_json")
      .eq("insight_type", "next_day_review")
      .eq("result_status", "success")
      .gte("created_at", recentReviewWindowStart),
    auth.scope.kind === "all"
      ? Promise.resolve({ data: [] as PendingViolationBadgeRow[] })
      : supabase
          .from("violation_cases")
          .select("id, submitted_by")
          .eq("status", "submitted")
          .eq("is_deleted", false),
  ]);
  const pendingRows = pendingRowsResult.data;

  const reviewedVideoIds = new Set(
    (reviewedResults ?? [])
      .map((row) => {
        const json = row.result_json as Record<string, unknown> | null;
        return typeof json?.video_id === "string" ? json.video_id : null;
      })
      .filter((id): id is string => id !== null),
  );

  let videosQuery = supabase
    .from("videos")
    .select("id, user_id, accounts(profile_id)")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (auth.scope.kind !== "all") {
    videosQuery = videosQuery.in("user_id", auth.scope.visibleUserIds);
  }
  const { data: videos } = await videosQuery;

  const scopedVideos = filterScopedRows(auth.scope, videos, (video) => {
    const accounts = video.accounts as { profile_id?: string | null } | Array<{ profile_id?: string | null }> | null;
    const account = Array.isArray(accounts) ? accounts[0] : accounts;
    return account?.profile_id ?? (video.user_id as string | null);
  });
  const contentCount = scopedVideos.filter((video) => !reviewedVideoIds.has(video.id as string)).length;
  const visiblePendingViolations =
    auth.scope.kind === "all"
      ? pendingViolations
      : filterScopedRows(
          auth.scope,
          (pendingRows ?? []) as PendingViolationBadgeRow[],
          (row) => row.submitted_by,
        ).length;
  const visibleConversionHubCount = visiblePendingViolations;

  const visiblePendingSubmissions =
    auth.scope.kind === "all"
      ? pendingSubmissions
      : await supabase
          .rpc("admin_pending_submissions_today", { target_date: date })
          .then((result) => filterScopedRows(auth.scope, result.data as unknown[] | null, (row) => (row as { profile_id?: string | null }).profile_id).length, () => 0);
  const visiblePendingVideos =
    auth.scope.kind === "all"
      ? pendingVideos
      : await supabase
          .rpc("admin_pending_videos_today", { target_date: date, limit_rows: 100 })
          .then((result) => filterScopedRows(auth.scope, result.data as unknown[] | null, (row) => (row as { submitted_by?: string | null }).submitted_by).length, () => 0);

  const payload = {
    cockpit: visiblePendingVideos + visiblePendingViolations + visiblePendingSubmissions,
    videos: visiblePendingVideos,
    content: contentCount,
    conversion_hub: visibleConversionHubCount,
    ai_channels: 0,
  };

  sidebarBadgesCache.set(cacheKey, {
    expiresAt: Date.now() + SIDEBAR_BADGES_CACHE_TTL_MS,
    payload,
  });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}

export async function GET(request: NextRequest) {
  return buildSidebarBadgesResponse(request);
}
