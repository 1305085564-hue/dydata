import type { SupabaseClient } from "@supabase/supabase-js";

import { getShanghaiDate } from "@/app/api/production/_shared";
import type { ScopedAdminVideoAccess } from "@/lib/admin-scoped-video";

export const SNAPSHOT_SELECT =
  "id, video_id, snapshot_type, captured_at, play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, avg_play_ratio, follower_gain, likes, comments, shares, favorites";

export type RefKey = "self" | "team" | "top" | "user";

export type MetricRow = {
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  avg_play_ratio: number | null;
  follower_gain: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
};

export type ComparisonMetricRow = Omit<MetricRow, "avg_play_ratio">;

export type SnapshotData = {
  video_id: string;
} & MetricRow;

export type LegacyPreviousRow = ComparisonMetricRow & {
  title: string | null;
  published_at: string | null;
};

export type LegacyRecent3Row = ComparisonMetricRow & {
  count: number;
};

type ReferenceMetricsParams = {
  supabase: SupabaseClient;
  videoId: string;
  video: Pick<ScopedAdminVideoAccess["video"], "account_id" | "user_id" | "published_at">;
  ref: RefKey;
  refUserId?: string | null;
};

type LegacyComparisonParams = {
  supabase: SupabaseClient;
  videoId: string;
  video: Pick<ScopedAdminVideoAccess["video"], "account_id" | "published_at">;
  ref: RefKey;
};

const METRIC_KEYS: (keyof MetricRow)[] = [
  "play_count",
  "bounce_rate_2s",
  "completion_rate_5s",
  "completion_rate",
  "avg_play_duration",
  "avg_play_ratio",
  "follower_gain",
  "likes",
  "comments",
  "shares",
  "favorites",
];

export function toMetricRow(snapshot: Record<string, unknown>): MetricRow {
  return {
    play_count: (snapshot.play_count as number | null) ?? null,
    bounce_rate_2s: (snapshot.bounce_rate_2s as number | null) ?? null,
    completion_rate_5s: (snapshot.completion_rate_5s as number | null) ?? null,
    completion_rate: (snapshot.completion_rate as number | null) ?? null,
    avg_play_duration: (snapshot.avg_play_duration as number | null) ?? null,
    avg_play_ratio: (snapshot.avg_play_ratio as number | null) ?? null,
    follower_gain: (snapshot.follower_gain as number | null) ?? null,
    likes: (snapshot.likes as number | null) ?? null,
    comments: (snapshot.comments as number | null) ?? null,
    shares: (snapshot.shares as number | null) ?? null,
    favorites: (snapshot.favorites as number | null) ?? null,
  };
}

export function toComparisonMetricRow(row: MetricRow): ComparisonMetricRow {
  return {
    play_count: row.play_count,
    bounce_rate_2s: row.bounce_rate_2s,
    completion_rate_5s: row.completion_rate_5s,
    completion_rate: row.completion_rate,
    avg_play_duration: row.avg_play_duration,
    follower_gain: row.follower_gain,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    favorites: row.favorites,
  };
}

export function averageMetricRows(rows: MetricRow[]): MetricRow | null {
  if (rows.length === 0) return null;

  const result: Record<string, number | null> = {};
  for (const key of METRIC_KEYS) {
    const values = rows.map((row) => row[key]).filter((value): value is number => value != null);
    result[key] =
      values.length > 0
        ? values.reduce((total: number, value: number) => total + value, 0) / values.length
        : null;
  }

  return result as MetricRow;
}

export function buildSnapshotMap(snapshots: unknown[]): Map<string, SnapshotData> {
  const map = new Map<string, SnapshotData>();

  for (const snapshot of snapshots) {
    const record = snapshot as Record<string, unknown>;
    const videoId = record.video_id;
    if (typeof videoId !== "string" || map.has(videoId)) continue;
    map.set(videoId, { video_id: videoId, ...toMetricRow(record) });
  }

  return map;
}

export function getShanghaiTodayStartIso() {
  return new Date(`${getShanghaiDate()}T00:00:00+08:00`).toISOString();
}

export async function getCurrentMetricRow(
  supabase: SupabaseClient,
  videoId: string,
): Promise<MetricRow | null> {
  const { data } = await supabase
    .from("video_metrics_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("video_id", videoId)
    .eq("snapshot_type", "24h")
    .maybeSingle();

  return data ? toMetricRow(data as Record<string, unknown>) : null;
}

export async function getReferenceMetrics({
  supabase,
  videoId,
  video,
  ref,
  refUserId,
}: ReferenceMetricsParams): Promise<{
  referenceRows: MetricRow[];
  reference: MetricRow | null;
  refLabel: string;
  refCount: number;
}> {
  let referenceRows: MetricRow[] = [];
  let refLabel = "对比自己近3条";

  if (ref === "self") {
    refLabel = "对比自己近3条";
    referenceRows = await getSelfReferenceRows(supabase, videoId, video.account_id, video.published_at);
  } else if (ref === "team") {
    refLabel = "对比团队均值";
    referenceRows = await getTeamReferenceRows(supabase, videoId, video.user_id);
  } else if (ref === "top") {
    refLabel = "对比今日团队最高播放";
    referenceRows = await getTopReferenceRows(supabase, videoId, video.user_id);
  } else if (ref === "user" && refUserId) {
    refLabel = "对比指定人近3条";
    referenceRows = await getUserReferenceRows(supabase, refUserId);
  }

  return {
    referenceRows,
    reference: averageMetricRows(referenceRows),
    refLabel,
    refCount: referenceRows.length,
  };
}

export async function getLegacyComparisonData({
  supabase,
  videoId,
  video,
  ref,
}: LegacyComparisonParams): Promise<{
  previous: LegacyPreviousRow | null;
  recent3: LegacyRecent3Row | null;
}> {
  if (ref !== "self" || !video.account_id || !video.published_at) {
    return { previous: null, recent3: null };
  }

  const [{ data: previousVideo }, { data: recent3Videos }] = await Promise.all([
    supabase
      .from("videos")
      .select("id, video_title, published_at")
      .eq("account_id", video.account_id)
      .lt("published_at", video.published_at)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("videos")
      .select("id, published_at")
      .eq("account_id", video.account_id)
      .neq("id", videoId)
      .lt("published_at", video.published_at)
      .order("published_at", { ascending: false })
      .limit(3),
  ]);

  const previousVideoRow = previousVideo as
    | { id: string; video_title?: string | null; published_at?: string | null }
    | null;
  const recent3VideoRows = (recent3Videos ?? []) as Array<{ id: string }>;
  const allIds = [
    ...(previousVideoRow ? [previousVideoRow.id] : []),
    ...recent3VideoRows.map((row) => row.id),
  ];

  if (allIds.length === 0) {
    return { previous: null, recent3: null };
  }

  const { data: snapshots } = await supabase
    .from("video_metrics_snapshots")
    .select(SNAPSHOT_SELECT)
    .in("video_id", allIds)
    .eq("snapshot_type", "24h");

  const snapshotMap = buildSnapshotMap(snapshots ?? []);
  const previousSnapshot = previousVideoRow ? snapshotMap.get(previousVideoRow.id) : null;
  const recent3Snapshots = recent3VideoRows
    .map((row) => snapshotMap.get(row.id))
    .filter((row): row is SnapshotData => row !== undefined);
  const averageRecent3 = averageMetricRows(recent3Snapshots);

  return {
    previous: previousSnapshot
      ? {
          ...toComparisonMetricRow(previousSnapshot),
          title: previousVideoRow?.video_title ?? null,
          published_at: previousVideoRow?.published_at ?? null,
        }
      : null,
    recent3: averageRecent3
      ? {
          ...toComparisonMetricRow(averageRecent3),
          count: recent3Snapshots.length,
        }
      : null,
  };
}

async function getSelfReferenceRows(
  supabase: SupabaseClient,
  videoId: string,
  accountId: string | null,
  publishedAt: string | null,
): Promise<MetricRow[]> {
  if (!accountId || !publishedAt) return [];

  const { data: recentVideos } = await supabase
    .from("videos")
    .select("id")
    .eq("account_id", accountId)
    .neq("id", videoId)
    .lt("published_at", publishedAt)
    .order("published_at", { ascending: false })
    .limit(3);

  const recentIds = ((recentVideos ?? []) as Array<{ id: string }>).map((row) => row.id);
  return getOrderedSnapshotRows(supabase, recentIds);
}

async function getUserReferenceRows(
  supabase: SupabaseClient,
  refUserId: string,
): Promise<MetricRow[]> {
  const { data: refAccounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("profile_id", refUserId);
  const refAccountIds = ((refAccounts ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (refAccountIds.length === 0) return [];

  const { data: recentVideos } = await supabase
    .from("videos")
    .select("id")
    .in("account_id", refAccountIds)
    .order("published_at", { ascending: false })
    .limit(3);
  const recentIds = ((recentVideos ?? []) as Array<{ id: string }>).map((row) => row.id);

  return getOrderedSnapshotRows(supabase, recentIds);
}

async function getTeamReferenceRows(
  supabase: SupabaseClient,
  videoId: string,
  userId: string | null,
): Promise<MetricRow[]> {
  const teamVideoIds = await getTodayTeamVideoIds(supabase, videoId, userId);
  if (teamVideoIds.length === 0) return [];

  const { data: snapshots } = await supabase
    .from("video_metrics_snapshots")
    .select(SNAPSHOT_SELECT)
    .in("video_id", teamVideoIds)
    .eq("snapshot_type", "24h");

  return (snapshots ?? []).map((snapshot) => toMetricRow(snapshot as Record<string, unknown>));
}

async function getTopReferenceRows(
  supabase: SupabaseClient,
  videoId: string,
  userId: string | null,
): Promise<MetricRow[]> {
  const teamVideoIds = await getTodayTeamVideoIds(supabase, videoId, userId);
  if (teamVideoIds.length === 0) return [];

  const { data: topSnapshot } = await supabase
    .from("video_metrics_snapshots")
    .select(SNAPSHOT_SELECT)
    .in("video_id", teamVideoIds)
    .eq("snapshot_type", "24h")
    .order("play_count", { ascending: false })
    .limit(1)
    .maybeSingle();

  return topSnapshot ? [toMetricRow(topSnapshot as Record<string, unknown>)] : [];
}

async function getTodayTeamVideoIds(
  supabase: SupabaseClient,
  videoId: string,
  userId: string | null,
): Promise<string[]> {
  const accountIds = await getTeamAccountIds(supabase, userId);
  if (accountIds.length === 0) return [];

  const { data: teamVideos } = await supabase
    .from("videos")
    .select("id")
    .in("account_id", accountIds)
    .neq("id", videoId)
    .gte("published_at", getShanghaiTodayStartIso());

  return ((teamVideos ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function getTeamAccountIds(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<string[]> {
  if (!userId) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();
  const teamId = (profile as { team_id?: string | null } | null)?.team_id;
  if (!teamId) return [];

  const { data: members } = await supabase
    .from("profiles")
    .select("id")
    .eq("team_id", teamId);
  const memberIds = ((members ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (memberIds.length === 0) return [];

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .in("profile_id", memberIds);

  return ((accounts ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function getOrderedSnapshotRows(
  supabase: SupabaseClient,
  videoIds: string[],
): Promise<MetricRow[]> {
  if (videoIds.length === 0) return [];

  const { data: snapshots } = await supabase
    .from("video_metrics_snapshots")
    .select(SNAPSHOT_SELECT)
    .in("video_id", videoIds)
    .eq("snapshot_type", "24h");

  const snapshotMap = buildSnapshotMap(snapshots ?? []);
  return videoIds
    .map((id) => snapshotMap.get(id))
    .filter((row): row is SnapshotData => row !== undefined)
    .map((row) => toMetricRow(row));
}
