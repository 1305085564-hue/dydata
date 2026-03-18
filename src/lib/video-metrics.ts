import { VideoMetricsSnapshot } from "@/types";

/** 互动率 = (赞+评+藏+转) / 播放 */
export function interactionRate(s: VideoMetricsSnapshot): number | null {
  if (!s.play_count || s.play_count === 0) return null;
  return (s.likes + s.comments + s.favorites + s.shares) / s.play_count;
}

/** 粉转率 = 涨粉 / 播放 */
export function followerConversionRate(s: VideoMetricsSnapshot): number | null {
  if (!s.play_count || s.play_count === 0) return null;
  return s.follower_gain / s.play_count;
}

/** 导粉率 = 导粉 / 播放 */
export function fanConversionRate(s: VideoMetricsSnapshot): number | null {
  if (!s.play_count || s.play_count === 0) return null;
  return s.follower_convert / s.play_count;
}

/** 主页访问率 = 主页访问 / 播放 */
export function homepageVisitRate(s: VideoMetricsSnapshot): number | null {
  if (!s.play_count || s.play_count === 0) return null;
  return s.homepage_visits / s.play_count;
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
