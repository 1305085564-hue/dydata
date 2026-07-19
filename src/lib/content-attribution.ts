import {
  METRIC_MAP,
  METRIC_MAP_INDEX,
  RATE_METRICS,
  THRESHOLD_BAD,
  THRESHOLD_RATE_BAD_PP,
  THRESHOLD_RATE_WARN_PP,
  THRESHOLD_WARN,
  type MetricKey,
  type SegmentHint,
} from "./content-attribution-map";

export type AttributionTone = "good" | "warn" | "bad" | "missing";

export interface AttributionLocate {
  kind: "segment" | "attribute";
  segment_hint: SegmentHint | null;
  /** 秒数：A 类可算出时给，算不出为 null */
  seconds: number | null;
}

export interface AttributionFinding {
  metric: MetricKey;
  metric_label: string;
  value: number | null;
  ref_value: number | null;
  delta: number | null;
  tone: AttributionTone;
  points_to: string;
  locate: AttributionLocate;
}

export interface AttributionResult {
  video_id: string;
  ref: string;
  ref_label: string;
  findings: AttributionFinding[];
  missing: MetricKey[];
  snapshot_ready: boolean;
}

type SnapshotRow = {
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

function getMetricValue(snapshot: SnapshotRow, metric: MetricKey): number | null {
  return snapshot[metric as keyof SnapshotRow] ?? null;
}

/** 判定 tone：lowerIsBetter 时 delta 为正表示"更差" */
function computeTone(
  delta: number,
  lowerIsBetter: boolean,
  isRateMetric: boolean,
): AttributionTone {
  // 转为"偏离幅度"（正=朝坏方向）
  const deviation = lowerIsBetter ? delta : -delta;

  if (isRateMetric) {
    // 比率类：百分点绝对差
    if (deviation >= THRESHOLD_RATE_BAD_PP) return "bad";
    if (deviation >= THRESHOLD_RATE_WARN_PP) return "warn";
    if (deviation <= -THRESHOLD_RATE_BAD_PP) return "good";
    return "good"; // 无明显偏差也归 good（展示"这项没问题"）
  } else {
    // 绝对量类：相对百分比偏离
    if (deviation >= THRESHOLD_BAD) return "bad";
    if (deviation >= THRESHOLD_WARN) return "warn";
    return "good";
  }
}

/** Step 3 定位：A 类指标推算 segment_hint 和 seconds */
function computeLocate(
  metric: MetricKey,
  currentSnapshot: SnapshotRow,
): AttributionLocate {
  const entry = METRIC_MAP_INDEX.get(metric)!;

  if (entry.locate_kind === "attribute") {
    return { kind: "attribute", segment_hint: null, seconds: null };
  }

  // A 类 & C 类 segment
  if (metric === "bounce_rate_2s") {
    return { kind: "segment", segment_hint: "opening", seconds: 2 };
  }
  if (metric === "completion_rate_5s") {
    return { kind: "segment", segment_hint: "opening", seconds: 5 };
  }
  if (metric === "avg_play_duration") {
    const avgPlay = currentSnapshot.avg_play_duration;
    const avgPlayRatio = currentSnapshot.avg_play_ratio;

    if (avgPlayRatio === null) {
      return { kind: "segment", segment_hint: null, seconds: avgPlay };
    }

    let hint: SegmentHint;
    if (avgPlayRatio < 1 / 3) hint = "opening";
    else if (avgPlayRatio <= 2 / 3) hint = "middle";
    else hint = "ending";

    return { kind: "segment", segment_hint: hint, seconds: avgPlay };
  }
  if (metric === "completion_rate") {
    return { kind: "segment", segment_hint: "ending", seconds: null };
  }
  if (metric === "play_count") {
    return { kind: "segment", segment_hint: "opening", seconds: null };
  }

  return {
    kind: entry.locate_kind,
    segment_hint: entry.default_segment_hint,
    seconds: null,
  };
}

const TONE_ORDER: Record<AttributionTone, number> = { bad: 0, warn: 1, missing: 2, good: 3 };

/** Step 4 排序：tone 优先，同 tone 按偏离幅度降序 */
function sortFindings(findings: AttributionFinding[]): AttributionFinding[] {
  return [...findings].sort((a, b) => {
    const toneDiff = TONE_ORDER[a.tone] - TONE_ORDER[b.tone];
    if (toneDiff !== 0) return toneDiff;
    const absA = Math.abs(a.delta ?? 0);
    const absB = Math.abs(b.delta ?? 0);
    return absB - absA;
  });
}

/**
 * 主入口：用确定性规则计算归因结论带，不调 AI。
 *
 * @param videoId   当前视频 id
 * @param current   当前视频 24h 快照
 * @param reference 参照系快照均值（null = 无快照，返回 snapshot_ready:false）
 * @param ref       参照系 key（self|team|top|user）
 * @param refLabel  参照系展示名称
 */
export function computeAttribution(
  videoId: string,
  current: SnapshotRow | null,
  reference: SnapshotRow | null,
  ref: string,
  refLabel: string,
): AttributionResult {
  if (!current) {
    return {
      video_id: videoId,
      ref,
      ref_label: refLabel,
      findings: [],
      missing: [],
      snapshot_ready: false,
    };
  }

  const findings: AttributionFinding[] = [];
  const missing: MetricKey[] = [];

  for (const entry of METRIC_MAP) {
    const value = getMetricValue(current, entry.metric);
    const refValue = reference ? getMetricValue(reference, entry.metric) : null;

    if (value === null || refValue === null) {
      missing.push(entry.metric);
      findings.push({
        metric: entry.metric,
        metric_label: entry.label,
        value,
        ref_value: refValue,
        delta: null,
        tone: "missing",
        points_to: entry.points_to,
        locate: computeLocate(entry.metric, current),
      });
      continue;
    }

    const isRate = RATE_METRICS.has(entry.metric);
    // delta = current - ref（比率类直接差百分点，绝对量类算相对百分比）
    let delta: number;
    if (isRate) {
      delta = value - refValue;
    } else {
      // 相对变化百分比（refValue 为 0 时无法计算，标 missing）
      if (refValue === 0) {
        missing.push(entry.metric);
        findings.push({
          metric: entry.metric,
          metric_label: entry.label,
          value,
          ref_value: refValue,
          delta: null,
          tone: "missing",
          points_to: entry.points_to,
          locate: computeLocate(entry.metric, current),
        });
        continue;
      }
      delta = ((value - refValue) / Math.abs(refValue)) * 100;
    }

    const tone = computeTone(delta, entry.lowerIsBetter, isRate);

    findings.push({
      metric: entry.metric,
      metric_label: entry.label,
      value,
      ref_value: refValue,
      delta: Math.round(delta * 10) / 10,
      tone,
      points_to: entry.points_to,
      locate: computeLocate(entry.metric, current),
    });
  }

  return {
    video_id: videoId,
    ref,
    ref_label: refLabel,
    findings: sortFindings(findings),
    missing,
    snapshot_ready: true,
  };
}
