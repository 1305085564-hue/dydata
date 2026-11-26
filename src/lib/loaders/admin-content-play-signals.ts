import type { Video, VideoMetricsSnapshot } from "@/types";

export type PreviousVideoCandidateRow = Pick<Video, "id" | "account_id" | "published_at">;
export type PreviousSnapshotRow = Pick<VideoMetricsSnapshot, "video_id" | "play_count" | "captured_at">;

function buildLatestPlayCountByVideoId(snapshots: PreviousSnapshotRow[]) {
  const playCountByVideoId = new Map<string, number | null>(); // gate:transient-map 单次请求内视频最新播放量索引，随请求结束释放
  const capturedAtByVideoId = new Map<string, number>(); // gate:transient-map 单次请求内快照时间索引，随请求结束释放

  for (const snapshot of snapshots) {
    const capturedAt = snapshot.captured_at ? new Date(snapshot.captured_at).getTime() : 0;
    const existingCapturedAt = capturedAtByVideoId.get(snapshot.video_id);
    if (existingCapturedAt !== undefined && existingCapturedAt >= capturedAt) continue;

    capturedAtByVideoId.set(snapshot.video_id, capturedAt);
    playCountByVideoId.set(snapshot.video_id, snapshot.play_count ?? null);
  }

  return playCountByVideoId;
}

export function findPreviousVideoByVisibleId<TVideo extends PreviousVideoCandidateRow>(
  visibleVideos: TVideo[],
  candidates: PreviousVideoCandidateRow[],
) {
  const candidatesByAccountId = new Map<string, PreviousVideoCandidateRow[]>(); // gate:transient-map 单次请求内账号作品分组，随请求结束释放

  for (const candidate of candidates) {
    if (!candidate.account_id || !candidate.published_at) continue;
    const rows = candidatesByAccountId.get(candidate.account_id) ?? [];
    rows.push(candidate);
    candidatesByAccountId.set(candidate.account_id, rows);
  }

  for (const rows of candidatesByAccountId.values()) {
    rows.sort((left, right) => new Date(right.published_at!).getTime() - new Date(left.published_at!).getTime());
  }

  const previousByVideoId = new Map<string, PreviousVideoCandidateRow>(); // gate:transient-map 单次请求内上一条作品映射，随请求结束释放
  for (const video of visibleVideos) {
    if (!video.account_id || !video.published_at) continue;
    const currentPublishedAt = new Date(video.published_at).getTime();
    const previousVideo = candidatesByAccountId
      .get(video.account_id)
      ?.find((candidate) => candidate.id !== video.id && new Date(candidate.published_at!).getTime() < currentPublishedAt);

    if (previousVideo) {
      previousByVideoId.set(video.id, previousVideo);
    }
  }

  return previousByVideoId;
}

export function attachPlayChangeSignals<TVideo extends PreviousVideoCandidateRow>({
  videos,
  currentSnapshots,
  previousVideos,
  previousSnapshots,
  surgeDeltaMin = 5_000,
}: {
  videos: TVideo[];
  currentSnapshots: PreviousSnapshotRow[];
  previousVideos: PreviousVideoCandidateRow[];
  previousSnapshots: PreviousSnapshotRow[];
  surgeDeltaMin?: number;
}) {
  const currentPlayCountByVideoId = buildLatestPlayCountByVideoId(currentSnapshots);
  const previousPlayCountByVideoId = buildLatestPlayCountByVideoId(previousSnapshots);
  const previousVideoByVisibleId = findPreviousVideoByVisibleId(videos, previousVideos);

  return videos.map((video) => {
    const previousVideo = previousVideoByVisibleId.get(video.id);
    const currentPlayCount = currentPlayCountByVideoId.get(video.id);
    const previousPlayCount = previousVideo ? previousPlayCountByVideoId.get(previousVideo.id) : null;

    if (currentPlayCount == null || previousPlayCount == null || previousPlayCount <= 0) {
      return {
        ...video,
        previous_play_count: previousPlayCount ?? null,
        play_count_change_pct: null,
        play_change_signal: null,
      };
    }

    const playCountChangePct = ((currentPlayCount - previousPlayCount) / previousPlayCount) * 100;
    const isSurge =
      currentPlayCount - previousPlayCount >= surgeDeltaMin &&
      playCountChangePct >= 100;
    // 「腰斩」信号已整体下线（2026-10-14 阿禅确认）：不再产出 halve，跌幅只保留原始百分比
    const playChangeSignal: Video["play_change_signal"] = isSurge ? "surge" : null;

    return {
      ...video,
      previous_play_count: previousPlayCount,
      play_count_change_pct: playCountChangePct,
      play_change_signal: playChangeSignal,
    };
  });
}
