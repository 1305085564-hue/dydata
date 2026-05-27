import type { Alert, AlertDetectorContext } from "./types";

type PendingInsightRow = {
  id: string;
  input_bundle_id: string | null;
  result_status: string | null;
  created_at: string;
  insight_type: string | null;
  result_json: Record<string, unknown> | null;
};

type InputBundleRow = {
  id: string;
  scope_entity_id: string | null;
  input_json: Record<string, unknown> | null;
};

type VideoRow = {
  id: string;
  user_id: string | null;
  video_title: string | null;
  uploaded_at: string | null;
  created_at: string;
};

type SegmentRow = {
  video_id: string | null;
};

function getAgeHours(createdAt: string, now: Date) {
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / (60 * 60 * 1000));
}

export async function detectTaskAlerts({ supabase, scope, now = new Date() }: AlertDetectorContext): Promise<Alert[]> {
  if (scope.visibleUserIds.length === 0) {
    return [];
  }

  const sixHoursAgoIso = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const oneHourAgoIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [pendingResult, recentVideosResult] = await Promise.all([
    supabase
      .from("ai_insight_result")
      .select("id, input_bundle_id, result_status, created_at, insight_type, result_json")
      .eq("result_status", "pending")
      .lte("created_at", sixHoursAgoIso)
      .order("created_at", { ascending: true }),
    supabase
      .from("videos")
      .select("id, user_id, video_title, uploaded_at, created_at")
      .in("user_id", scope.visibleUserIds)
      .gte("created_at", oneDayAgoIso)
      .lte("created_at", oneHourAgoIso),
  ]);

  if (pendingResult.error) throw new Error(pendingResult.error.message);
  if (recentVideosResult.error) throw new Error(recentVideosResult.error.message);

  const pendingRows = (pendingResult.data ?? []) as PendingInsightRow[];
  const inputBundleIds = pendingRows.map((row) => row.input_bundle_id).filter((id): id is string => Boolean(id));
  const { data: inputBundlesRaw, error: bundleError } = inputBundleIds.length > 0
    ? await supabase.from("ai_input_bundle").select("id, scope_entity_id, input_json").in("id", inputBundleIds)
    : { data: [], error: null };

  if (bundleError) throw new Error(bundleError.message);

  const inputBundleById = new Map(((inputBundlesRaw ?? []) as InputBundleRow[]).map((row) => [row.id, row]));
  const videoIdsFromBundles = Array.from(
    new Set(
      (inputBundlesRaw ?? [])
        .map((row) => (typeof row.scope_entity_id === "string" ? row.scope_entity_id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const videoLookupResult = videoIdsFromBundles.length > 0
    ? await supabase.from("videos").select("id, user_id, video_title, uploaded_at, created_at").in("id", videoIdsFromBundles)
    : { data: [], error: null };

  if (videoLookupResult.error) throw new Error(videoLookupResult.error.message);

  const videoById = new Map(((videoLookupResult.data ?? []) as VideoRow[]).map((row) => [row.id, row]));
  const alerts: Alert[] = [];

  for (const row of pendingRows) {
    const bundle = row.input_bundle_id ? inputBundleById.get(row.input_bundle_id) ?? null : null;
    const bundleUserId = typeof bundle?.input_json?.user_id === "string" ? bundle.input_json.user_id : null;
    const bundleVideoId = typeof bundle?.scope_entity_id === "string" ? bundle.scope_entity_id : null;
    const video = bundleVideoId ? videoById.get(bundleVideoId) ?? null : null;
    const ownerUserId = bundleUserId ?? video?.user_id ?? null;

    if (scope.businessRole !== "owner" && (!ownerUserId || !scope.visibleUserIds.includes(ownerUserId))) {
      continue;
    }

    const ageHours = getAgeHours(row.created_at, now);
    const affectedEntities: Alert["affectedEntities"] = [
      {
        type: "task" as const,
        id: row.id,
        name: row.insight_type ?? "AI 任务",
      },
    ];

    if (video) {
      affectedEntities.push({
        type: "video",
        id: video.id,
        name: video.video_title?.trim() || "未命名视频",
      });
    }

    alerts.push({
      id: `task:pending:${row.id}`,
      source: "task",
      severity: "critical",
      title: "AI 任务长时间 pending",
      detail: `任务已等待 ${ageHours} 小时，仍未完成`,
      affectedEntities,
      suggestedActions: [
        { label: "打开批改台", type: "navigate", href: "/admin/content?view=pending" },
      ],
      createdAt: now.toISOString(),
    });
  }

  const recentVideos = (recentVideosResult.data ?? []) as VideoRow[];
  const recentVideoIds = recentVideos.map((video) => video.id);
  const segmentsResult = recentVideoIds.length > 0
    ? await supabase.from("video_content_segments").select("video_id").in("video_id", recentVideoIds)
    : { data: [], error: null };

  if (segmentsResult.error) throw new Error(segmentsResult.error.message);

  const segmentVideoIds = new Set(
    ((segmentsResult.data ?? []) as SegmentRow[])
      .map((row) => row.video_id)
      .filter((videoId): videoId is string => Boolean(videoId)),
  );

  for (const video of recentVideos) {
    if (segmentVideoIds.has(video.id)) continue;
    alerts.push({
      id: `task:segments-missing:${video.id}`,
      source: "task",
      severity: "warning",
      title: "视频拆段结果缺失",
      detail: "最近 24 小时有视频未生成拆段结果，疑似任务失败或卡住",
      affectedEntities: [
        {
          type: "video",
          id: video.id,
          name: video.video_title?.trim() || "未命名视频",
        },
      ],
      suggestedActions: [
        { label: "打开批改台", type: "navigate", href: "/admin/content?view=pending" },
      ],
      createdAt: now.toISOString(),
    });
  }

  return alerts;
}
