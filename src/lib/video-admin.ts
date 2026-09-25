import type { Video, VideoMetricsSnapshot } from "@/types";
import { parseNullableMetricInput } from "@/lib/video-24h-metrics-contract";

/**
 * 补录 24h 表单指标。
 * 口径与 video-24h-metrics-contract 一致：空 = 未采集(null)，明确填 0 才是 0。
 * 禁止把空输入默认成 0——那会把「没采集」伪造成「采集为 0」。
 */
export type Patch24hMetricsInput = {
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_loss: number | null;
  follower_convert: number | null;
};

export type Patch24hMetricsFormState = Record<keyof Patch24hMetricsInput, string>;

/** 补录框八个指标的统一解析：空/null/非法 → null，其余为有限数字（含 0）。 */
export function parsePatch24hMetrics(form: Patch24hMetricsFormState): Patch24hMetricsInput {
  return {
    play_count: parseNullableMetricInput(form.play_count),
    likes: parseNullableMetricInput(form.likes),
    comments: parseNullableMetricInput(form.comments),
    shares: parseNullableMetricInput(form.shares),
    favorites: parseNullableMetricInput(form.favorites),
    follower_gain: parseNullableMetricInput(form.follower_gain),
    follower_loss: parseNullableMetricInput(form.follower_loss),
    follower_convert: parseNullableMetricInput(form.follower_convert),
  };
}

export function shouldShowPatch24hButton(
  video: Pick<Video, "anomaly_status">,
  snapshot: Pick<VideoMetricsSnapshot, "id"> | null
) {
  return video.anomaly_status === "未满24h" || snapshot === null;
}

export function build24hSnapshotPayload(
  videoId: string,
  metrics: Patch24hMetricsInput,
  screenshotUrl: string | null
) {
  return {
    video_id: videoId,
    snapshot_type: "24h" as const,
    play_count: metrics.play_count,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    favorites: metrics.favorites,
    follower_gain: metrics.follower_gain,
    follower_loss: metrics.follower_loss,
    follower_convert: metrics.follower_convert,
    homepage_visits: 0,
    fan_play_ratio: null,
    cover_click_rate: null,
    avg_play_duration: null,
    completion_rate: null,
    bounce_rate_2s: null,
    completion_rate_5s: null,
    avg_play_ratio: null,
    vs_previous: null,
    screenshot_urls: screenshotUrl ? [screenshotUrl] : null,
    curve_screenshot_url: null,
    retention_screenshot_url: null,
  };
}

/** 更新已有 24h 快照时只改人工表单字段，避免清空截图和未展示的留存指标。 */
export function build24hSnapshotUpdatePatch(metrics: Patch24hMetricsInput) {
  return {
    play_count: metrics.play_count,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    favorites: metrics.favorites,
    follower_gain: metrics.follower_gain,
    follower_loss: metrics.follower_loss,
    follower_convert: metrics.follower_convert,
  };
}

export { parseNullableMetricInput };
