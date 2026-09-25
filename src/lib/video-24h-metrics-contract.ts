/**
 * 24h 指标唯一契约。
 *
 * 约定：
 * - null = 未采集/未知，不等于 0；
 * - 0 = 已明确采集且结果为零；
 * - 创建时只有 requiredOnCreate 的六个核心计数必须有值；
 * - 读取和编辑必须接受数据库中真实存在的 null，不能靠类型断言把它变成数字。
 */

export const VIDEO_24H_METRIC_DEFINITIONS = [
  { dbKey: "play_count", apiKey: "playCount", formKey: "play_count", label: "播放量", requiredOnCreate: true, nullable: false },
  { dbKey: "likes", apiKey: "likes", formKey: "likes", label: "点赞", requiredOnCreate: true, nullable: false },
  { dbKey: "comments", apiKey: "comments", formKey: "comments", label: "评论", requiredOnCreate: true, nullable: false },
  { dbKey: "shares", apiKey: "shares", formKey: "shares", label: "分享", requiredOnCreate: true, nullable: false },
  { dbKey: "favorites", apiKey: "favorites", formKey: "favorites", label: "收藏", requiredOnCreate: true, nullable: false },
  { dbKey: "follower_gain", apiKey: "followerGain", formKey: "follower_gain", label: "涨粉", requiredOnCreate: true, nullable: false },
  { dbKey: "follower_loss", apiKey: "followerLoss", formKey: "follower_loss", label: "掉粉", requiredOnCreate: false, nullable: true },
  { dbKey: "follower_convert", apiKey: "followerConvert", formKey: "follower_convert", label: "导粉", requiredOnCreate: false, nullable: true },
  { dbKey: "avg_play_duration", apiKey: "avgPlayDuration", formKey: "avg_play_duration", label: "平均播放时长", requiredOnCreate: false, nullable: true },
  { dbKey: "bounce_rate_2s", apiKey: "bounceRate2s", formKey: "bounce_rate_2s", label: "2秒跳出率", requiredOnCreate: false, nullable: true },
  { dbKey: "completion_rate_5s", apiKey: "completionRate5s", formKey: "completion_rate_5s", label: "5秒完播率", requiredOnCreate: false, nullable: true },
  { dbKey: "completion_rate", apiKey: "completionRate", formKey: "completion_rate", label: "完播率", requiredOnCreate: false, nullable: true },
] as const;

export type Video24hMetricDefinition = (typeof VIDEO_24H_METRIC_DEFINITIONS)[number];
export type Video24hMetricKey = Video24hMetricDefinition["dbKey"];
export type Video24hMetricApiKey = Video24hMetricDefinition["apiKey"];
export type Video24hMetricFormKey = Video24hMetricDefinition["formKey"];

export const REQUIRED_VIDEO_24H_METRIC_KEYS = VIDEO_24H_METRIC_DEFINITIONS
  .filter((field) => field.requiredOnCreate)
  .map((field) => field.dbKey) as unknown as readonly Extract<Video24hMetricKey, string>[];

export const NULLABLE_VIDEO_24H_METRIC_KEYS = VIDEO_24H_METRIC_DEFINITIONS
  .filter((field) => field.nullable)
  .map((field) => field.dbKey) as unknown as readonly Extract<Video24hMetricKey, string>[];

export type Video24hMetricRecord = Record<Video24hMetricKey, number | null>;

export function isNullableVideo24hMetric(key: string): key is Video24hMetricKey {
  return NULLABLE_VIDEO_24H_METRIC_KEYS.includes(key as Video24hMetricKey);
}

export function isRequiredOnCreateVideo24hMetric(key: string): key is Video24hMetricKey {
  return REQUIRED_VIDEO_24H_METRIC_KEYS.includes(key as Video24hMetricKey);
}

export function isNullableVideo24hApiKey(key: string): boolean {
  return VIDEO_24H_METRIC_DEFINITIONS.some((field) => field.apiKey === key && field.nullable);
}

export function parseNullableMetricInput(value: string | null | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function metricDisplayValue(value: number | null): number | null {
  return value === null ? null : value;
}
