export const VIDEO_REVIEW_THRESHOLDS_KEY = "video_review_thresholds";

export const DEFAULT_VIDEO_REVIEW_THRESHOLDS = {
  bounce_rate_2s: 30,
  completion_rate_5s: 50,
  avg_play_duration: 30,
  completion_rate: 5,
  play_count: 1000,
} as const;

export type VideoReviewThresholds = {
  bounce_rate_2s: number;
  completion_rate_5s: number;
  avg_play_duration: number;
  completion_rate: number;
  play_count: number;
};

type ThresholdField = keyof VideoReviewThresholds;

const THRESHOLD_FIELDS: ThresholdField[] = [
  "bounce_rate_2s",
  "completion_rate_5s",
  "avg_play_duration",
  "completion_rate",
  "play_count",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isValidNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseVideoReviewThresholds(
  input: unknown,
): { data: VideoReviewThresholds } | { error: string } {
  if (!isRecord(input)) return { error: "thresholds 必须是对象" };

  for (const field of THRESHOLD_FIELDS) {
    if (!isValidNumber(input[field])) {
      return { error: `${field} 必须是有限数字` };
    }
  }

  const bounceRate = input.bounce_rate_2s as number;
  const completionRate5s = input.completion_rate_5s as number;
  const completionRate = input.completion_rate as number;
  const avgPlayDuration = input.avg_play_duration as number;
  const playCount = input.play_count as number;

  if (bounceRate < 0 || bounceRate > 100) {
    return { error: "bounce_rate_2s 必须在 0-100 之间" };
  }
  if (completionRate5s < 0 || completionRate5s > 100) {
    return { error: "completion_rate_5s 必须在 0-100 之间" };
  }
  if (completionRate < 0 || completionRate > 100) {
    return { error: "completion_rate 必须在 0-100 之间" };
  }
  if (avgPlayDuration < 0) {
    return { error: "avg_play_duration 不能小于 0" };
  }
  if (playCount < 0 || !Number.isInteger(playCount)) {
    return { error: "play_count 必须是非负整数" };
  }

  return {
    data: {
      bounce_rate_2s: bounceRate,
      completion_rate_5s: completionRate5s,
      avg_play_duration: avgPlayDuration,
      completion_rate: completionRate,
      play_count: playCount,
    },
  };
}

export function normalizeVideoReviewThresholds(input: unknown): VideoReviewThresholds {
  const parsed = parseVideoReviewThresholds(input);
  return "data" in parsed ? parsed.data : { ...DEFAULT_VIDEO_REVIEW_THRESHOLDS };
}
