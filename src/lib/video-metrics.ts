import { VideoMetricsSnapshot } from "@/types";

function requirePositivePlayCount(s: Pick<VideoMetricsSnapshot, "play_count">): number | null {
  if (s.play_count == null || s.play_count === 0) return null;
  return s.play_count;
}

/** 互动率 = (赞+评+藏+转) / 播放；任一输入未采集则返回 null */
export function interactionRate(s: VideoMetricsSnapshot): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null) return null;
  const { likes, comments, favorites, shares } = s;
  if (likes == null || comments == null || favorites == null || shares == null) return null;
  return (likes + comments + favorites + shares) / play;
}

/** 转粉率 = 涨粉 / 播放 */
export function followerConversionRate(s: VideoMetricsSnapshot): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null || s.follower_gain == null) return null;
  return s.follower_gain / play;
}

/** 导粉率 = 导粉 / 播放；导粉未采集(null) 返回 null，不隐式算成 0 */
export function fanConversionRate(s: VideoMetricsSnapshot): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null || s.follower_convert == null) return null;
  return s.follower_convert / play;
}

/** 点赞率 = 点赞 / 播放 */
export function likeRate(s: VideoMetricsSnapshot): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null || s.likes == null) return null;
  return s.likes / play;
}

/** 收藏率 = 收藏 / 播放 */
export function favoriteRate(s: VideoMetricsSnapshot): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null || s.favorites == null) return null;
  return s.favorites / play;
}

/** 爆款系数 = 本视频24h播放 / 基线中位数 */
export function breakoutCoefficient(playCount: number, baselineMedian: number | null): number | null {
  if (!baselineMedian || baselineMedian === 0) return null;
  return playCount / baselineMedian;
}

/** 计算中位数 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 获取账号基线中位数 */
export function getAccountBaseline(
  accountPlayCounts: number[],
  teamMedian: number | null
): { median: number | null; strategy: "self" | "mixed" | "insufficient" } {
  const count = accountPlayCounts.length;
  if (count >= 10) {
    return { median: median(accountPlayCounts), strategy: "self" };
  }
  if (count >= 3 && teamMedian !== null) {
    const selfMedian = median(accountPlayCounts);
    if (selfMedian === null) return { median: teamMedian, strategy: "mixed" };
    return { median: selfMedian * 0.5 + teamMedian * 0.5, strategy: "mixed" };
  }
  return { median: null, strategy: "insufficient" };
}
