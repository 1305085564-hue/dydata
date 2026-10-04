import { favoriteRate, interactionRate, likeRate } from "@/lib/video-metrics";
import {
  buildContentQualitySummaryFromWorks,
  buildWorkContentQualityFromMetrics,
  contentQualityRules as sharedContentQualityRules,
} from "@/lib/content-quality";
import type {
  ContentQualityRules,
  ContentQualitySummary,
  PersonWriterQuality,
  PersonWriterWorkItem,
  WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";
import type {
  CollaborationAccount,
  CollaborationReport,
  ContentQualityTopicContext,
  VideoSnapshotMetrics,
} from "./types";
import { accountMap } from "./report-rules";

export function contentQualityRules(): ContentQualityRules { return sharedContentQualityRules(); }

function snapshotMetricInput(snapshot: VideoSnapshotMetrics) {
  return {
    play_count: snapshot.playCount,
    likes: snapshot.likes,
    comments: snapshot.comments,
    shares: snapshot.shares,
    favorites: snapshot.favorites,
  };
}

export function buildWorkContentQuality(
  row: CollaborationReport,
  snapshot: VideoSnapshotMetrics | undefined,
  topics: ContentQualityTopicContext,
): WorkContentQuality {
  return buildWorkContentQualityFromMetrics(
    { videoId: row.video_id, snapshot },
    topics,
  );
}

export function buildContentQualitySummary(
  rows: CollaborationReport[],
  snapshots: Map<string, VideoSnapshotMetrics>,
  topics: ContentQualityTopicContext,
): ContentQualitySummary {
  const works = rows.map((row) => buildWorkContentQuality(
    row,
    row.video_id ? snapshots.get(row.video_id) : undefined,
    topics,
  ));
  return buildContentQualitySummaryFromWorks(works, rows.length);
}

function mapWriterWorkItem(
  row: CollaborationReport,
  accountsById: Map<string, CollaborationAccount>,
  snapshots: Map<string, VideoSnapshotMetrics>,
  topics: ContentQualityTopicContext,
): PersonWriterWorkItem {
  const snapshot = row.video_id ? snapshots.get(row.video_id) : undefined;
  const metrics = snapshot ? snapshotMetricInput(snapshot) : null;
  return {
    reportId: row.id,
    videoId: row.video_id,
    reportDate: row.report_date,
    accountId: row.account_id,
    accountName: accountsById.get(row.account_id)?.name?.trim() || "未命名账号",
    title: row.title?.trim() || "未命名作品",
    playCount: snapshot?.playCount ?? row.play_count,
    dataSource: row.data_source ?? null,
    interactionRate: metrics ? interactionRate(metrics) : null,
    likeRate: metrics ? likeRate(metrics) : null,
    favoriteRate: metrics ? favoriteRate(metrics) : null,
    contentQuality: buildWorkContentQuality(row, snapshot, topics),
  };
}

export function buildPersonWriterQuality(input: {
  targetUserId: string;
  currentRows: CollaborationReport[];
  growthRows: CollaborationReport[];
  accounts: CollaborationAccount[];
  snapshots: Map<string, VideoSnapshotMetrics>;
  topics: ContentQualityTopicContext;
}): PersonWriterQuality {
  const accountsById = accountMap(input.accounts);
  const monthRows = input.currentRows.filter((row) => row.script_author_user_id === input.targetUserId);
  const monthWorks = monthRows
    .map((row) => mapWriterWorkItem(row, accountsById, input.snapshots, input.topics))
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.reportId.localeCompare(a.reportId));
  return {
    state: input.topics.state === "ready" ? "ready" : "error",
    rules: contentQualityRules(),
    monthSummary: input.topics.state === "ready"
      ? buildContentQualitySummary(monthRows, input.snapshots, input.topics)
      : null,
    monthWorks,
    growthSummary: input.topics.state === "ready"
      ? buildContentQualitySummary(input.growthRows, input.snapshots, input.topics)
      : null,
  };
}
