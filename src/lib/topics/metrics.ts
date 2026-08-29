export const TOPIC_LIBRARY_QUALIFY_PLAY_COUNT = 30_000;

export interface TopicInternalMetrics {
  bestPlayCount: number | null;
  averagePlayCount: number | null;
  qualifiedWorkCount: number;
  workCount: number;
}

export interface TopicExternalMetrics {
  bestPlayCount: number | null;
  likesCount: number | null;
  sampleCount: number | null;
}

/**
 * 内部成绩：全部关联作品的最高播放、平均播放、达标作品数、作品总数。
 * 只统计团队内部真实作品，不混入外部数据。
 */
export function computeInternalMetrics(rows: Array<{ playCount: number | null }>): TopicInternalMetrics {
  const workCount = rows.length;
  if (!workCount) {
    return { bestPlayCount: null, averagePlayCount: null, qualifiedWorkCount: 0, workCount: 0 };
  }
  const playCounts = rows.map((row) => Number(row.playCount ?? 0));
  const total = playCounts.reduce((sum, value) => sum + value, 0);
  return {
    bestPlayCount: Math.max(...playCounts),
    averagePlayCount: Math.round(total / workCount),
    qualifiedWorkCount: playCounts.filter((value) => value >= TOPIC_LIBRARY_QUALIFY_PLAY_COUNT).length,
    workCount,
  };
}

/** 外部成绩：只读导入时保存的外部参考数据，与内部成绩严格分开。 */
export function buildExternalMetrics(row: {
  source_type?: string | null;
  external_play_count?: number | string | null;
  external_like_count?: number | string | null;
  external_sample_count?: number | string | null;
}): TopicExternalMetrics | null {
  if (row.source_type !== "external") return null;
  const toNumber = (value: number | string | null | undefined) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    bestPlayCount: toNumber(row.external_play_count),
    likesCount: toNumber(row.external_like_count),
    sampleCount: toNumber(row.external_sample_count),
  };
}
