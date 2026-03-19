import type { Video, VideoMetricsSnapshot } from "@/types";

export type Patch24hMetricsInput = {
  play_count: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  follower_gain: number;
  follower_loss: number;
  follower_convert: number;
};

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
