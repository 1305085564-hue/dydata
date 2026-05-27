import type {
  AnomalyStatus,
  NextDayReviewAccountBaseline,
  NextDayReviewActions,
  NextDayReviewComparison,
  NextDayReviewMetrics,
  NextDayReviewPeerBaseline,
  NextDayReviewResult,
  NextDayReviewSegment,
  NextDayReviewSummary,
  SampleCredibility,
  SampleLevel,
  SegmentHealth,
  SegmentPriority,
} from "@/types";

export interface ReviewSegmentInput {
  segment_order: number;
  segment_type: string;
  segment_text: string;
  estimated_start_sec: number | null;
  estimated_end_sec: number | null;
}

export interface ReviewPromptBundle {
  sample_level: SampleLevel;
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  follower_gain: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  anomaly_status: AnomalyStatus | null;
  script_raw_text: string | null;
  segments: ReviewSegmentInput[];
  account_baseline: NextDayReviewAccountBaseline;
  peer_baseline: NextDayReviewPeerBaseline;
  anomaly_notice: string | null;
}

type ParsedAiReview = {
  summary: NextDayReviewSummary;
  actions: NextDayReviewActions;
  segments: Array<{
    segment_order: number;
    segment_type: string;
    segment_text: string;
    health: SegmentHealth;
    judgement: string;
    reason: string;
    suggestion: string;
    priority: SegmentPriority;
  }>;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeHealth(value: unknown): SegmentHealth {
  return value === "problem" || value === "warning" || value === "ok" ? value : "warning";
}

function normalizePriority(value: unknown): SegmentPriority {
  return value === "primary" || value === "secondary" ? value : "secondary";
}

function normalizeLevel(level: SampleLevel, anomalyStatus: AnomalyStatus | null): SampleLevel {
  const degradeOnce = (input: SampleLevel): SampleLevel => {
    if (input === "full") return "partial";
    if (input === "partial") return "insufficient";
    return "insufficient";
  };

  if (anomalyStatus === "投流") return degradeOnce(level);
  return level;
}

export function getAnomalyNotice(anomalyStatus: AnomalyStatus | null): string | null {
  if (anomalyStatus === "删稿" || anomalyStatus === "限流" || anomalyStatus === "活动干预") {
    return "异常状态干扰结论：本次结果受删稿/限流/活动干预影响，以下判断已按保守口径处理";
  }
  if (anomalyStatus === "投流") {
    return "异常状态提醒：检测到投流，结论强度已自动降一级";
  }
  return null;
}

export function getSampleCredibility(
  playCount: number | null | undefined,
  anomalyStatus: AnomalyStatus | null = null,
): SampleCredibility {
  if (playCount == null) {
    return {
      level: "insufficient",
      label: "缺少24h数据",
      guide: "暂无24h快照，先补数据再复盘",
    };
  }

  const rawLevel: SampleLevel =
    playCount < 20000 ? "insufficient" : playCount <= 30000 ? "partial" : "full";
  const level = normalizeLevel(rawLevel, anomalyStatus);

  if (level === "insufficient") {
    return {
      level,
      label: "样本不足",
      guide: "主看流量结果，不主看率类数据",
    };
  }
  if (level === "partial") {
    return {
      level,
      label: "可初步参考",
      guide: "流量与率类都看，但只做方向性判断",
    };
  }
  return {
    level,
    label: "可正式复盘",
    guide: "样本达到有效区间，可做段落级诊断",
  };
}

export function formatTimeRange(startSec: number | null, endSec: number | null): string {
  if (startSec == null || endSec == null) return "时间未知";
  const toClock = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };
  return `${toClock(startSec)}-${toClock(endSec)}`;
}

export function buildAccountBaseline(
  snapshots: Array<{
    play_count: number | null;
    bounce_rate_2s: number | null;
    completion_rate_5s: number | null;
    completion_rate: number | null;
    avg_play_duration: number | null;
  }>,
): NextDayReviewAccountBaseline {
  if (!snapshots.length) {
    return {
      sample_count: 0,
      play_count: null,
      bounce_rate_2s: null,
      completion_rate_5s: null,
      completion_rate: null,
      avg_play_duration: null,
    };
  }

  const average = (values: Array<number | null>) => {
    const nums = values.filter((v): v is number => v != null);
    if (!nums.length) return null;
    return nums.reduce((sum, n) => sum + n, 0) / nums.length;
  };

  return {
    sample_count: snapshots.length,
    play_count: average(snapshots.map((s) => s.play_count)),
    bounce_rate_2s: average(snapshots.map((s) => s.bounce_rate_2s)),
    completion_rate_5s: average(snapshots.map((s) => s.completion_rate_5s)),
    completion_rate: average(snapshots.map((s) => s.completion_rate)),
    avg_play_duration: average(snapshots.map((s) => s.avg_play_duration)),
  };
}

export function buildPeerBaselinePlaceholder(): NextDayReviewPeerBaseline {
  return {
    available: false,
    sample_count: 0,
    summary: "第一版暂未启用同类比较",
  };
}

export function buildNextDayReviewPrompt(bundle: ReviewPromptBundle): string {
  const sampleRuleLine =
    bundle.sample_level === "insufficient"
      ? "样本不足：禁止强段落归因，结论保守。"
      : bundle.sample_level === "partial"
      ? "样本可初步参考：只能输出方向性判断。"
      : "样本充足：可输出明确段落诊断。";

  const anomalyRuleLine = bundle.anomaly_notice
    ? `异常约束：${bundle.anomaly_notice}`
    : "异常约束：无";

  const conservativeRuleLine =
    bundle.anomaly_status === "删稿" || bundle.anomaly_status === "限流" || bundle.anomaly_status === "活动干预"
      ? "保守口径：异常状态存在时，summary 和 actions 必须使用‘倾向/可能/方向性’措辞，不下绝对结论。"
      : "保守口径：按样本等级执行。";

  return [
    "你是抖音内容批改台教练。",
    "只输出 JSON，不要 Markdown。",
    "输出字段必须包含：summary、segments、actions。",
    "summary: {grade, one_line, problem_tags[]}。",
    "segments: 每段含 segment_order, segment_type, segment_text, health, judgement, reason, suggestion, priority。",
    "actions: {diagnosis, instructions(3条), message_for_member}。",
    sampleRuleLine,
    anomalyRuleLine,
    conservativeRuleLine,
    "禁止空话，建议必须具体可执行。",
    "",
    "指标：",
    `play_count=${bundle.play_count ?? "null"}`,
    `bounce_rate_2s=${bundle.bounce_rate_2s ?? "null"}`,
    `completion_rate_5s=${bundle.completion_rate_5s ?? "null"}`,
    `completion_rate=${bundle.completion_rate ?? "null"}`,
    `avg_play_duration=${bundle.avg_play_duration ?? "null"}`,
    `follower_gain=${bundle.follower_gain ?? "null"}`,
    `likes=${bundle.likes ?? "null"}, comments=${bundle.comments ?? "null"}, shares=${bundle.shares ?? "null"}`,
    "",
    "同账号30天基线：",
    JSON.stringify(bundle.account_baseline),
    "",
    "同类基线：",
    JSON.stringify(bundle.peer_baseline),
    "",
    "文案原文：",
    bundle.script_raw_text ?? "（空）",
    "",
    "切段：",
    bundle.segments.length ? JSON.stringify(bundle.segments) : "[]",
  ].join("\n");
}

export function parseNextDayReviewResult(jsonString: string): ParsedAiReview | null {
  try {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;
    const summaryRaw = (parsed.summary ?? {}) as Record<string, unknown>;
    const actionsRaw = (parsed.actions ?? {}) as Record<string, unknown>;
    const segmentsRaw = Array.isArray(parsed.segments) ? parsed.segments : [];

    const instructionsRaw = Array.isArray(actionsRaw.instructions) ? actionsRaw.instructions : [];

    const summary: NextDayReviewSummary = {
      grade: typeof summaryRaw.grade === "string" && summaryRaw.grade.trim() ? summaryRaw.grade.trim() : "C",
      one_line:
        typeof summaryRaw.one_line === "string" && summaryRaw.one_line.trim()
          ? summaryRaw.one_line.trim()
          : "样本不足，先观察1-2条再下结论",
      problem_tags: (Array.isArray(summaryRaw.problem_tags) ? summaryRaw.problem_tags : [])
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .slice(0, 5),
    };

    const actions: NextDayReviewActions = {
      diagnosis:
        typeof actionsRaw.diagnosis === "string" && actionsRaw.diagnosis.trim()
          ? actionsRaw.diagnosis.trim()
          : "先看开头留人和中段节奏",
      instructions: instructionsRaw.map((item) => String(item).trim()).filter(Boolean).slice(0, 3),
      message_for_member:
        typeof actionsRaw.message_for_member === "string" && actionsRaw.message_for_member.trim()
          ? actionsRaw.message_for_member.trim()
          : "先改开头前3秒，再压缩背景段，最后把CTA提前。",
    };

    while (actions.instructions.length < 3) {
      actions.instructions.push(`第${actions.instructions.length + 1}条建议待补充`);
    }

    const segments = segmentsRaw
      .map((item, idx) => {
        const row = item as Record<string, unknown>;
        return {
          segment_order: toNumber(row.segment_order) ?? idx,
          segment_type: typeof row.segment_type === "string" && row.segment_type.trim() ? row.segment_type.trim() : "其他",
          segment_text: typeof row.segment_text === "string" ? row.segment_text : "",
          health: normalizeHealth(row.health),
          judgement: typeof row.judgement === "string" && row.judgement.trim() ? row.judgement.trim() : "该段需优化",
          reason: typeof row.reason === "string" && row.reason.trim() ? row.reason.trim() : "当前数据对比基线偏弱",
          suggestion: typeof row.suggestion === "string" && row.suggestion.trim() ? row.suggestion.trim() : "压缩该段并提前核心观点",
          priority: normalizePriority(row.priority),
        };
      })
      .slice(0, 20);

    return { summary, actions, segments };
  } catch {
    return null;
  }
}

export function buildStructuredReviewResult(params: {
  videoId: string;
  sample: SampleCredibility;
  metrics: NextDayReviewMetrics;
  comparison: NextDayReviewComparison;
  anomalyNotice: string | null;
  segmentInputs: ReviewSegmentInput[];
  aiReview: ParsedAiReview;
  cached: boolean;
}): NextDayReviewResult {
  const { videoId, sample, metrics, comparison, anomalyNotice, segmentInputs, aiReview, cached } = params;

  const toSegment = (input: ReviewSegmentInput, aiSegment: ParsedAiReview["segments"][number] | undefined): NextDayReviewSegment => ({
    segment_order: input.segment_order,
    segment_type: input.segment_type,
    segment_text: input.segment_text,
    time_range: formatTimeRange(input.estimated_start_sec, input.estimated_end_sec),
    health: aiSegment?.health ?? "warning",
    judgement: aiSegment?.judgement ?? "该段需优化",
    reason: aiSegment?.reason ?? "当前指标未达基线",
    suggestion: aiSegment?.suggestion ?? "压缩冗余并提前观点",
    priority: aiSegment?.priority ?? "secondary",
  });

  let segments: NextDayReviewSegment[] = segmentInputs.map((segment) =>
    toSegment(segment, aiReview.segments.find((item) => item.segment_order === segment.segment_order)),
  );

  if (sample.level === "insufficient") {
    segments = [];
  }

  const summaryOneLine =
    sample.level === "insufficient"
      ? "样本不足，先观察分发，再决定是否大改"
      : sample.level === "partial"
      ? `方向性判断：${aiReview.summary.one_line}`
      : aiReview.summary.one_line;

  const conservativeByAnomaly = anomalyNotice ? `保守判断：${summaryOneLine}` : summaryOneLine;

  return {
    ok: true,
    video_id: videoId,
    sample_level: sample.level,
    sample_status: sample.label,
    sample_message: sample.guide,
    review_status: "success",
    summary: {
      grade: aiReview.summary.grade,
      one_line: conservativeByAnomaly,
      problem_tags: aiReview.summary.problem_tags,
    },
    metrics,
    comparison,
    anomaly_notice: anomalyNotice,
    segments,
    actions: aiReview.actions,
    cached,
  };
}
