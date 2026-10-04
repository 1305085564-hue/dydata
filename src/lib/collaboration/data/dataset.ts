import type { SupabaseClient } from "@supabase/supabase-js";

import { loadWriterCertifications } from "@/lib/writer-certifications";
import { loadWorkGroupDirectory } from "@/lib/work-groups";
import { getPreviousMonthRange, unique } from "../domain/report-rules";
import { STATS_START_DATE } from "../domain/types";
import type {
  CollaborationMonthDataset,
  CollaborationReport,
  MonthRange,
  ContentQualityTopicContext,
  VideoSnapshotMetrics,
} from "../domain/types";
import {
  loadLookups,
  loadProfiles,
  queryScopedReports,
} from "./reports";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { buildLatestVideoSnapshotMap } from "@/lib/video-snapshot-map";

const SNAPSHOT_METRICS_FIELDS =
  "video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain, captured_at";
/** PostgREST `.in()` 走查询串，批次过大有 URL 长度风险；100 个 UUID 约 4.4KB。 */
const SNAPSHOT_ID_BATCH_SIZE = 100;

function toSnapshotMetrics(row: {
  video_id: string;
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
}): VideoSnapshotMetrics {
  return {
    videoId: row.video_id,
    playCount: row.play_count,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    favorites: row.favorites,
    followerGain: row.follower_gain,
  };
}

/** 批量拉当月作品的 24h 快照，每视频只保留最新一条（与内容抽屉取数口径一致）。 */
export async function loadVideoSnapshotMetrics(
  supabase: SupabaseClient,
  rows: CollaborationReport[],
): Promise<Map<string, VideoSnapshotMetrics>> {
  const videoIds = unique(rows.map((row) => row.video_id));
  if (videoIds.length === 0) return new Map(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const batches: string[][] = [];
  for (let index = 0; index < videoIds.length; index += SNAPSHOT_ID_BATCH_SIZE) {
    batches.push(videoIds.slice(index, index + SNAPSHOT_ID_BATCH_SIZE));
  }
  const results = await Promise.all(
    batches.map((batch) =>
      supabase
        .from("video_metrics_snapshots")
        .select(SNAPSHOT_METRICS_FIELDS)
        .eq("snapshot_type", "24h")
        .in("video_id", batch)
        .then((result) => {
          assertSupabaseQuerySucceeded(result.error, "读取视频复盘快照失败");
          return (result.data ?? []) as Array<Parameters<typeof toSnapshotMetrics>[0]>;
        }),
    ),
  );
  return buildLatestVideoSnapshotMap(results.flat(), toSnapshotMetrics);
}

/** 批量拉作品话题标签；成功无标签与读取失败必须保持可区分。 */
export async function loadVideoTopicTags(
  supabase: SupabaseClient,
  rows: CollaborationReport[],
): Promise<ContentQualityTopicContext> {
  const videoIds = unique(rows.map((row) => row.video_id));
  const tags = new Map<string, string | null>(videoIds.map((id) => [id, null])); // gate:transient-map 函数内临时聚合，随调用栈释放
  if (videoIds.length === 0) return { state: "ready", tags };
  try {
    const batches: string[][] = [];
    for (let index = 0; index < videoIds.length; index += SNAPSHOT_ID_BATCH_SIZE) {
      batches.push(videoIds.slice(index, index + SNAPSHOT_ID_BATCH_SIZE));
    }
    const results = await Promise.all(
      batches.map((batch) =>
        supabase
          .from("video_tags")
          .select("video_id, tag_value")
          .eq("tag_dimension", "话题")
          .in("video_id", batch)
          .then((result) => {
            assertSupabaseQuerySucceeded(result.error, "读取视频话题标签失败");
            return (result.data ?? []) as Array<{ video_id: string; tag_value: string | null }>;
          }),
      ),
    );
    for (const row of results.flat()) {
      if (row.video_id && tags.has(row.video_id)) tags.set(row.video_id, row.tag_value ?? null);
    }
    return { state: "ready", tags };
  } catch {
    return { state: "error", tags: new Map() }; // gate:transient-map 函数内临时聚合，随调用栈释放
  }
}

/**
 * 协作页首屏共享数据集：统计起点~当月末的日报一次查询，内存按月切分；
 * summary/operators/talents/staff 原先分别扫描当月日报，现共享 1 份行集。
 * 各岗位在内存完成统计起点与责任人过滤。
 */
export async function loadCollaborationMonthDataset(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  range: MonthRange;
  includeWriterCertifications?: boolean;
  /** 传了团队 id 才顺带加载工种小队目录；按岗位模式不传，零额外查询。 */
  workGroupTeamIds?: Array<string | null | undefined>;
}): Promise<CollaborationMonthDataset> {
  const previousRange = getPreviousMonthRange(input.range.year, input.range.month);
  const rows = await queryScopedReports({
    supabase: input.supabase,
    visibleUserIds: input.visibleUserIds,
    start: STATS_START_DATE,
    end: input.range.end,
  });
  const currentRows = rows.filter((row) => row.report_date >= input.range.start);
  const previousRows = rows.filter(
    (row) => row.report_date >= previousRange.start && row.report_date <= previousRange.end,
  );
  const { profiles, accounts } = await loadLookups(input.supabase, rows);
  const writerCertifications = input.includeWriterCertifications
    ? await loadWriterCertifications(input.supabase, input.visibleUserIds) : [];
  const missingIds = writerCertifications.filter(c => c.certified && !profiles.some(p => p.id === c.userId)).map(c => c.userId);
  profiles.push(...await loadProfiles(input.supabase, missingIds));
  const workGroups = input.workGroupTeamIds
    ? await loadWorkGroupDirectory(input.supabase, { teamIds: input.workGroupTeamIds })
    : undefined;
  // 岗位比率与小组比率共用最新 24h 快照；文案质量并行读取轻量话题标签。
  // 未同步作品只参与产量，不参与比率；标签失败只让质量块明确报错，不拖垮旧岗位数据。
  const [videoSnapshots, videoTopicTags] = await Promise.all([
    loadVideoSnapshotMetrics(input.supabase, currentRows),
    loadVideoTopicTags(input.supabase, currentRows),
  ]);
  return {
    currentRows,
    previousRows,
    historyRows: rows,
    profiles,
    accounts,
    writerCertifications,
    visibleUserIds: input.visibleUserIds,
    workGroups,
    videoSnapshots,
    videoTopicTags,
  };
}
