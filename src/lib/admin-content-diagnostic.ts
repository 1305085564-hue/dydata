import type { SupabaseClient } from "@supabase/supabase-js";

import type { ScopedAdminVideoAccess } from "@/lib/admin-scoped-video";

export type DiagnosticMetricRow = {
  video_id: string;
  play_count: number | null;
  completion_rate: number | null;
  completion_rate_5s: number | null;
  bounce_rate_2s: number | null;
  avg_play_duration: number | null;
  follower_gain: number | null;
};

export type DiagnosticMetricAggregate = {
  play_count: number | null;
  completion_rate: number | null;
  completion_rate_5s: number | null;
  bounce_rate_2s: number | null;
  avg_play_duration: number | null;
  follower_gain: number | null;
};

export type DiagnosticBaseline = {
  sample_count: number;
  metrics: DiagnosticMetricAggregate;
  delta: DiagnosticMetricAggregate;
  compared_video_ids: string[];
};

export type DiagnosticTopBaseline = DiagnosticBaseline & {
  selection_metric: "play_count";
  top_ratio: number;
};

export type DiagnosticComparePayload = {
  ok: true;
  video_id: string;
  published_day: string;
  current: DiagnosticMetricAggregate;
  self_baseline: DiagnosticBaseline;
  team_baseline: DiagnosticBaseline;
  team_top_baseline: DiagnosticTopBaseline;
};

export class AdminContentDiagnosticError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 422,
  ) {
    super(message);
  }
}

const DIAGNOSTIC_METRIC_KEYS: Array<keyof DiagnosticMetricAggregate> = [
  "play_count",
  "completion_rate",
  "completion_rate_5s",
  "bounce_rate_2s",
  "avg_play_duration",
  "follower_gain",
];

function average(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function aggregateDiagnosticMetrics(rows: DiagnosticMetricRow[]): DiagnosticMetricAggregate {
  return {
    play_count: average(rows.map((row) => row.play_count)),
    completion_rate: average(rows.map((row) => row.completion_rate)),
    completion_rate_5s: average(rows.map((row) => row.completion_rate_5s)),
    bounce_rate_2s: average(rows.map((row) => row.bounce_rate_2s)),
    avg_play_duration: average(rows.map((row) => row.avg_play_duration)),
    follower_gain: average(rows.map((row) => row.follower_gain)),
  };
}

export function buildDiagnosticMetricDelta(
  current: DiagnosticMetricAggregate,
  baseline: DiagnosticMetricAggregate,
): DiagnosticMetricAggregate {
  const delta: Partial<DiagnosticMetricAggregate> = {};

  for (const key of DIAGNOSTIC_METRIC_KEYS) {
    const currentValue = current[key];
    const baselineValue = baseline[key];
    delta[key] = currentValue == null || baselineValue == null ? null : currentValue - baselineValue;
  }

  return delta as DiagnosticMetricAggregate;
}

function buildBaseline(current: DiagnosticMetricAggregate, rows: DiagnosticMetricRow[]): DiagnosticBaseline {
  const metrics = aggregateDiagnosticMetrics(rows);
  return {
    sample_count: rows.length,
    metrics,
    delta: buildDiagnosticMetricDelta(current, metrics),
    compared_video_ids: rows.map((row) => row.video_id),
  };
}

function pickTopRowsByPlayCount(rows: DiagnosticMetricRow[], ratio: number) {
  if (!rows.length) return [];
  const sorted = rows
    .slice()
    .sort((left, right) => (right.play_count ?? 0) - (left.play_count ?? 0));
  const count = Math.max(1, Math.ceil(sorted.length * ratio));
  return sorted.slice(0, count);
}

export function buildDiagnosticComparePayload(input: {
  videoId: string;
  publishedDay: string;
  current: DiagnosticMetricRow;
  selfRows: DiagnosticMetricRow[];
  teamRows: DiagnosticMetricRow[];
  topRatio?: number;
}): DiagnosticComparePayload {
  const topRatio = input.topRatio ?? 0.3;
  const current = aggregateDiagnosticMetrics([input.current]);
  const topRows = pickTopRowsByPlayCount(input.teamRows, topRatio);

  return {
    ok: true,
    video_id: input.videoId,
    published_day: input.publishedDay,
    current,
    self_baseline: buildBaseline(current, input.selfRows),
    team_baseline: buildBaseline(current, input.teamRows),
    team_top_baseline: {
      ...buildBaseline(current, topRows),
      selection_metric: "play_count",
      top_ratio: topRatio,
    },
  };
}

type SnapshotSelectRow = DiagnosticMetricRow & {
  captured_at: string | null;
};

function latestSnapshots(rows: SnapshotSelectRow[] | null | undefined) {
  const latestByVideoId = new Map<string, SnapshotSelectRow>();

  for (const row of rows ?? []) {
    const current = latestByVideoId.get(row.video_id);
    const rowTime = row.captured_at ? new Date(row.captured_at).getTime() : 0;
    const currentTime = current?.captured_at ? new Date(current.captured_at).getTime() : 0;
    if (!current || rowTime >= currentTime) {
      latestByVideoId.set(row.video_id, row);
    }
  }

  return Array.from(latestByVideoId.values()).map(({ captured_at: _capturedAt, ...rest }) => rest);
}

async function loadLatest24hSnapshots(
  supabase: Pick<SupabaseClient, "from">,
  videoIds: string[],
) {
  if (!videoIds.length) return [];

  const { data, error } = await supabase
    .from("video_metrics_snapshots")
    .select(
      "video_id,play_count,completion_rate,completion_rate_5s,bounce_rate_2s,avg_play_duration,follower_gain,captured_at",
    )
    .in("video_id", videoIds)
    .eq("snapshot_type", "24h");

  if (error) {
    throw new AdminContentDiagnosticError(error.message || "加载视频快照失败", "LOAD_SNAPSHOT_FAILED", 500);
  }

  return latestSnapshots((data ?? []) as SnapshotSelectRow[]);
}

function formatShanghaiDay(dateString: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(dateString));
}

function shanghaiDayRange(day: string) {
  const start = `${day}T00:00:00+08:00`;
  const [year, month, date] = day.split("-").map((item) => Number.parseInt(item, 10));
  const next = new Date(Date.UTC(year, month - 1, date) + 24 * 60 * 60 * 1000);
  const nextDay = next.toISOString().slice(0, 10);
  return {
    start,
    end: `${nextDay}T00:00:00+08:00`,
  };
}

export async function loadAdminContentDiagnostic(access: ScopedAdminVideoAccess): Promise<DiagnosticComparePayload> {
  const { supabase, video } = access;
  if (!video.published_at) {
    throw new AdminContentDiagnosticError("视频缺少发布时间，暂不能做对比诊断", "NO_PUBLISHED_AT");
  }
  if (!video.account_id) {
    throw new AdminContentDiagnosticError("视频缺少账号归属，暂不能做对比诊断", "NO_ACCOUNT_ID");
  }

  const currentSnapshots = await loadLatest24hSnapshots(supabase, [video.id]);
  const current = currentSnapshots[0];
  if (!current) {
    throw new AdminContentDiagnosticError("缺少 24h 快照，暂不能做对比诊断", "NO_24H_SNAPSHOT");
  }

  const { data: selfVideoRows, error: selfVideoError } = await supabase
    .from("videos")
    .select("id")
    .eq("account_id", video.account_id)
    .neq("id", video.id)
    .lt("published_at", video.published_at)
    .order("published_at", { ascending: false })
    .limit(5);

  if (selfVideoError) {
    throw new AdminContentDiagnosticError(selfVideoError.message || "加载账号历史视频失败", "LOAD_SELF_VIDEOS_FAILED", 500);
  }

  const selfVideoIds = (selfVideoRows ?? []).map((row) => row.id).filter(Boolean);
  const selfRows = await loadLatest24hSnapshots(supabase, selfVideoIds);

  const { data: ownerProfile, error: ownerProfileError } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", video.user_id)
    .maybeSingle();

  if (ownerProfileError) {
    throw new AdminContentDiagnosticError(ownerProfileError.message || "加载团队信息失败", "LOAD_OWNER_PROFILE_FAILED", 500);
  }

  let teamRows: DiagnosticMetricRow[] = [];
  if (ownerProfile?.team_id) {
    const { data: teamMembers, error: teamMembersError } = await supabase
      .from("profiles")
      .select("id")
      .eq("team_id", ownerProfile.team_id);

    if (teamMembersError) {
      throw new AdminContentDiagnosticError(teamMembersError.message || "加载团队成员失败", "LOAD_TEAM_MEMBERS_FAILED", 500);
    }

    const teamUserIds = (teamMembers ?? []).map((row) => row.id).filter(Boolean);
    if (teamUserIds.length) {
      const range = shanghaiDayRange(formatShanghaiDay(video.published_at));
      const { data: teamVideos, error: teamVideosError } = await supabase
        .from("videos")
        .select("id")
        .in("user_id", teamUserIds)
        .neq("id", video.id)
        .gte("published_at", range.start)
        .lt("published_at", range.end)
        .limit(500);

      if (teamVideosError) {
        throw new AdminContentDiagnosticError(teamVideosError.message || "加载团队日内视频失败", "LOAD_TEAM_VIDEOS_FAILED", 500);
      }

      const teamVideoIds = (teamVideos ?? []).map((row) => row.id).filter(Boolean);
      teamRows = await loadLatest24hSnapshots(supabase, teamVideoIds);
    }
  }

  return buildDiagnosticComparePayload({
    videoId: video.id,
    publishedDay: formatShanghaiDay(video.published_at),
    current,
    selfRows,
    teamRows,
  });
}
