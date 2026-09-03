export const REPORT_COUNT_MAX = 1_000_000_000;
export const REPORT_PERCENT_MAX = 100;
export const REPORT_DURATION_SECONDS_MAX = 86_400;
export const REPORT_TITLE_MAX_LENGTH = 120;
export const REPORT_TEXT_MAX_LENGTH = 10_000;
export const EXEMPTION_REASON_MAX_LENGTH = 500;
export const EXEMPTION_FEEDBACK_MAX_LENGTH = 2_000;
export const TOPIC_TITLE_MAX_LENGTH = 120;
export const TOPIC_HOOK_MAX_LENGTH = 500;
export const TOPIC_ID_MAX_LENGTH = 80;
export const TOPIC_CATEGORY_MAX_LENGTH = 120;
export const TOPIC_EMOTION_TAG_MAX_LENGTH = 40;
export const TOPIC_SOURCE_MAX_LENGTH = 40;
export const TOPIC_AUDIENCE_MAX_LENGTH = 80;
export const TOPIC_IMPORT_TITLE_MAX_LENGTH = 200;
export const TOPIC_IMPORT_OUTLINE_MAX_LENGTH = 5_000;
export const CONVERSION_SCRIPT_TEXT_MAX_LENGTH = 10_000;
export const CONVERSION_NOTE_MAX_LENGTH = 1_000;
export const CONVERSION_PLATFORM_NOTICE_MAX_LENGTH = 5_000;
export const CONVERSION_REASON_MAX_LENGTH = 1_000;
export const CONVERSION_APPEAL_RESULT_MAX_LENGTH = 2_000;

const COUNT_FIELD_LABELS = {
  play_count: "播放量",
  likes: "点赞数",
  comments: "评论数",
  shares: "分享数",
  favorites: "收藏数",
  follower_gain: "涨粉数",
  follower_loss: "掉粉数",
  follower_convert: "导粉数",
} as const;

const PERCENT_FIELD_LABELS = {
  bounce_rate_2s: "2秒跳出率",
  completion_rate_5s: "5秒完播率",
  completion_rate: "整体完播率",
} as const;

type CountMetricKey = keyof typeof COUNT_FIELD_LABELS;
type PercentMetricKey = keyof typeof PERCENT_FIELD_LABELS;

export type ReportMetricBoundaryInput = Partial<Record<CountMetricKey | PercentMetricKey | "avg_play_duration", unknown>>;

export type BoundaryResult<T> = { ok: true; data: T } | { ok: false; error: string };

function numberFromInput(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validateCountMetric(key: CountMetricKey, value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = numberFromInput(value);
  const label = COUNT_FIELD_LABELS[key];
  if (numeric === null) return `${label}必须是有效数字`;
  if (!Number.isInteger(numeric)) return `${label}必须是整数`;
  if (numeric < 0) return `${label}不能为负数`;
  if (numeric > REPORT_COUNT_MAX) return `${label}不能超过 ${REPORT_COUNT_MAX}`;
  return null;
}

function validatePercentMetric(key: PercentMetricKey, value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = numberFromInput(value);
  const label = PERCENT_FIELD_LABELS[key];
  if (numeric === null) return `${label}必须是有效数字`;
  if (numeric < 0 || numeric > REPORT_PERCENT_MAX) return `${label}必须在 0-${REPORT_PERCENT_MAX} 之间`;
  return null;
}

function validateDuration(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = numberFromInput(value);
  if (numeric === null) return "平均播放时长必须是有效数字";
  if (numeric < 0 || numeric > REPORT_DURATION_SECONDS_MAX) {
    return `平均播放时长必须在 0-${REPORT_DURATION_SECONDS_MAX} 秒之间`;
  }
  return null;
}

export function validateReportMetricBoundaries(metrics: ReportMetricBoundaryInput): BoundaryResult<ReportMetricBoundaryInput> {
  for (const key of Object.keys(COUNT_FIELD_LABELS) as CountMetricKey[]) {
    const error = validateCountMetric(key, metrics[key]);
    if (error) return { ok: false, error };
  }
  for (const key of Object.keys(PERCENT_FIELD_LABELS) as PercentMetricKey[]) {
    const error = validatePercentMetric(key, metrics[key]);
    if (error) return { ok: false, error };
  }
  const durationError = validateDuration(metrics.avg_play_duration);
  if (durationError) return { ok: false, error: durationError };
  return { ok: true, data: metrics };
}

export function validateTextBoundary(input: {
  label: string;
  value: unknown;
  maxLength: number;
  required?: boolean;
}): BoundaryResult<string | null> {
  if (input.value === undefined || input.value === null) {
    return input.required ? { ok: false, error: `${input.label}不能为空` } : { ok: true, data: null };
  }
  if (typeof input.value !== "string") return { ok: false, error: `${input.label}必须是文本` };
  const trimmed = input.value.trim();
  if (!trimmed) {
    return input.required ? { ok: false, error: `${input.label}不能为空` } : { ok: true, data: null };
  }
  if (trimmed.length > input.maxLength) {
    return { ok: false, error: `${input.label}不能超过 ${input.maxLength} 个字符` };
  }
  return { ok: true, data: trimmed };
}

export type AdminDailyReportUpdateInput = {
  title: string;
  play_count: number;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  follower_gain: number;
  follower_convert: number | null;
};

export function validateAdminDailyReportUpdate(data: AdminDailyReportUpdateInput): BoundaryResult<AdminDailyReportUpdateInput> {
  const title = validateTextBoundary({
    label: "标题",
    value: data.title,
    maxLength: REPORT_TITLE_MAX_LENGTH,
    required: true,
  });
  if (!title.ok) return title;
  if (title.data === null) return { ok: false, error: "标题不能为空" };

  const metrics = validateReportMetricBoundaries({
    play_count: data.play_count,
    likes: data.likes,
    comments: data.comments,
    shares: data.shares,
    favorites: data.favorites,
    follower_gain: data.follower_gain,
    follower_convert: data.follower_convert,
    completion_rate: data.completion_rate,
    avg_play_duration: data.avg_play_duration,
    bounce_rate_2s: data.bounce_rate_2s,
    completion_rate_5s: data.completion_rate_5s,
  });
  if (!metrics.ok) return metrics;

  return {
    ok: true,
    data: {
      ...data,
      title: title.data,
    },
  };
}
