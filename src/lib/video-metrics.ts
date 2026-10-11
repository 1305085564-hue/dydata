import { VideoMetricsSnapshot } from "@/types";

function requirePositivePlayCount(s: Pick<VideoMetricsSnapshot, "play_count">): number | null {
  if (s.play_count == null || s.play_count === 0) return null;
  return s.play_count;
}

/**
 * 比率是否物理上不可能：单项行为数（赞/评/藏/转/涨粉/导粉）超过播放量本身。
 *
 * 背景（2026-10-11 审计实证）：生产库存在一条播放量 2 的作品，24h 快照里却带着
 * 数百个互动数，于是详情页算出「转粉率 5450%、互动率 31250%」，还照常给了个「优」。
 * 管理者会把这种脏数据当成有效证据下判断——这是本页唯一会直接导致错误决策的问题。
 *
 * 为什么不直接在 breakout-rating 封顶达成率：封顶只是把天文数字削成 100%，
 * 仍然会显示成「优 100%」，脏数据依旧冒充正常信号。正确做法是在**比率层**就判无效，
 * 让它与「未采集」同路降级（不出评级、显示待核），列表/详情/评级/达成率四处一起收口。
 *
 * 判据用「行为数 > 播放量」而不是「比率 > 100%」：
 *  - 互动率是赞评藏转四项之和，四项加起来超过播放量才是真的不可能；
 *  - 但若点赞这一项单独就超过播放量，同样不可能（四项之和掩盖不了单项越界）；
 * 故对参与计算的每个行为数逐项校验，任何一项越界即整体判无效。
 */
function isPhysicallyPossible(play: number, counts: Array<number | null | undefined>): boolean {
  for (const count of counts) {
    if (count == null) continue;
    if (!Number.isFinite(count) || count < 0) return false;
    if (count > play) return false;
  }
  return true;
}

/** 互动率 = (赞+评+藏+转) / 播放；任一输入未采集或物理上不可能则返回 null */
export function interactionRate(
  s: Pick<VideoMetricsSnapshot, "play_count" | "likes" | "comments" | "favorites" | "shares">
): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null) return null;
  const { likes, comments, favorites, shares } = s;
  if (likes == null || comments == null || favorites == null || shares == null) return null;
  // 单项越界即脏（四项之和可能仍在播放量以内，掩盖单项越界）
  if (!isPhysicallyPossible(play, [likes, comments, favorites, shares])) return null;
  // 四项之和越界同样是脏数据
  if (!isPhysicallyPossible(play, [likes + comments + favorites + shares])) return null;
  return (likes + comments + favorites + shares) / play;
}

/** 转粉率 = 涨粉 / 播放；涨粉超过播放量属脏数据 */
export function followerConversionRate(
  s: Pick<VideoMetricsSnapshot, "play_count" | "follower_gain">
): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null || s.follower_gain == null) return null;
  if (!isPhysicallyPossible(play, [s.follower_gain])) return null;
  return s.follower_gain / play;
}

/** 导粉率 = 导粉 / 播放；导粉未采集(null) 返回 null，不隐式算成 0 */
export function fanConversionRate(
  s: Pick<VideoMetricsSnapshot, "play_count" | "follower_convert">
): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null || s.follower_convert == null) return null;
  if (!isPhysicallyPossible(play, [s.follower_convert])) return null;
  return s.follower_convert / play;
}

/** 点赞率 = 点赞 / 播放；点赞超过播放量属脏数据 */
export function likeRate(
  s: Pick<VideoMetricsSnapshot, "play_count" | "likes">
): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null || s.likes == null) return null;
  if (!isPhysicallyPossible(play, [s.likes])) return null;
  return s.likes / play;
}

/** 收藏率 = 收藏 / 播放；收藏超过播放量属脏数据 */
export function favoriteRate(
  s: Pick<VideoMetricsSnapshot, "play_count" | "favorites">
): number | null {
  const play = requirePositivePlayCount(s);
  if (play == null || s.favorites == null) return null;
  if (!isPhysicallyPossible(play, [s.favorites])) return null;
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
