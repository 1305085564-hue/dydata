/**
 * 历史手稿保存 → 24h 快照同步。
 *
 * 背景：历史手稿只写 daily_reports（+ videos 标题/责任人），管理端 24h 快照是另一本账。
 * 业务口径（2026-09-24）：手稿保存同步写快照，同一指标只保留一本真源。
 *
 * 边界：
 * - 只覆盖手稿表单里出现的指标；follower_loss / 截图 / vs_previous / 留存槽位一律不碰；
 * - 空值按契约写 null（未采集），明确 0 才写 0；
 * - 无 24h 快照时不新建（避免伪造证据），有则更新；
 * - 无绑定视频时本函数不参与。
 */

export type HistoryReportSnapshotMetricInput = {
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  avg_play_duration: number | null;
  bounce_rate_2s: number | null;
  completion_rate: number | null;
  completion_rate_5s: number | null;
};

/** 手稿指标 → 24h 快照字段。刻意不含 follower_loss、截图、vs_previous、留存截图。 */
export function buildHistoryReport24hSnapshotPatch(
  input: HistoryReportSnapshotMetricInput,
): HistoryReportSnapshotMetricInput {
  return {
    play_count: input.play_count,
    likes: input.likes,
    comments: input.comments,
    shares: input.shares,
    favorites: input.favorites,
    follower_gain: input.follower_gain,
    follower_convert: input.follower_convert,
    avg_play_duration: input.avg_play_duration,
    bounce_rate_2s: input.bounce_rate_2s,
    completion_rate: input.completion_rate,
    completion_rate_5s: input.completion_rate_5s,
  };
}

export type HistorySnapshotSyncResult = {
  data?: Array<{ id: string }> | null;
  error?: { message?: string | null } | null;
} | null;

/**
 * 判定快照同步是否失败。
 * - 无绑定视频：不参与，不失败；
 * - 有绑定视频但库错误：失败；
 * - 有绑定视频且 0 行（尚无 24h 快照）：不失败，只更新不新建。
 */
export function isHistorySnapshotSyncFailure(
  boundVideoId: string | null,
  result: HistorySnapshotSyncResult,
) {
  if (!boundVideoId) return false;
  return Boolean(result?.error);
}
