import type { VideoTopicKind } from "@/lib/topics/library";

/**
 * 爆款标准线（按视频「话题」分类，阈值为小数）。
 * 干货与复盘的互动率与第四格阈值都不同；第四格按话题各取其一
 * （干货收藏率 1.8% / 复盘点赞率 2%），转粉率两套通用。
 * 2026-09-30 调整：干货收藏率 2% → 1.8%，互动率 3.2% → 3.5%；复盘互动率 2.7% → 3%；
 * 复盘点赞率 2% 与转粉率 1% 不变。评级档位（达成率 100/80/60）未动。
 */
export interface BreakoutTargets {
  /** 互动率标准线 */
  interaction: number;
  /** 第四格标准线：干货为收藏率，复盘及其他为点赞率 */
  fourth: number;
  /** 转粉率标准线（两套通用） */
  follower: number;
}

export const BREAKOUT_TARGETS: Record<"dry_goods" | "review", BreakoutTargets> = {
  // 干货：互动率 3.5%、收藏率 1.8%、转粉率 1%
  dry_goods: { interaction: 0.035, fourth: 0.018, follower: 0.01 },
  // 复盘：互动率 3%、点赞率 2%、转粉率 1%
  review: { interaction: 0.03, fourth: 0.02, follower: 0.01 },
};

export type BreakoutGrade = "优" | "良" | "普" | "劣";
/**
 * 纯文字状态色（加深色阶：优深紫、良深红、普深褐黄、劣深松绿，小字下清晰扎实）
 * 注：2026-09-22 删除已无消费方的胶囊底色版 `BREAKOUT_GRADE_CLASS`
 * （其注释写「优=成功绿 / 劣=异常红」，与实际配色语义相反，留着会读错）
 */
export const BREAKOUT_GRADE_TEXT_CLASS: Record<BreakoutGrade, string> = {
  优: "text-[#5E3A8C]", // 深紫墨
  良: "text-[#9E2A2B]", // 深朱红
  普: "text-[#875317]", // 深琥珀金黄
  劣: "text-[#28663D]", // 深松柏绿
};

export interface BreakoutRating {
  grade: BreakoutGrade;
  /** 达成率百分比，不封顶 */
  achievement: number;
}

/**
 * 话题分类是否「已识别」——只有三种已知分类算已识别。
 * null（状态未取到）与 undefined（调用方未传）都不算：此时不能按复盘口径出数，
 * 否则「还没拿到分类」会被静默当成复盘，第四格显示成点赞率而真假难辨。
 */
export function hasKnownTopicKind(
  topicKind: VideoTopicKind | null | undefined,
): topicKind is VideoTopicKind {
  return topicKind === "dry_goods" || topicKind === "review" || topicKind === "other";
}

/** 该话题对应的标准线；无标签（other）与复盘同口径，与大盘第四格一致 */
export function breakoutTargetsFor(
  topicKind: VideoTopicKind | null | undefined,
): BreakoutTargets {
  return topicKind === "dry_goods"
    ? BREAKOUT_TARGETS.dry_goods
    : BREAKOUT_TARGETS.review;
}

/** 达成率 = 实际 ÷ 标准 × 100，不封顶；缺实际值或标准非法时返回 null */
export function breakoutAchievement(
  actual: number | null | undefined,
  target: number,
): number | null {
  if (actual === null || actual === undefined || !Number.isFinite(actual)) {
    return null;
  }
  if (!Number.isFinite(target) || target <= 0) return null;
  return (actual / target) * 100;
}

/** 评级：≥100 优、≥80 良、≥60 普、<60 劣 */
export function breakoutGrade(
  achievement: number | null | undefined,
): BreakoutGrade | null {
  if (
    achievement === null ||
    achievement === undefined ||
    !Number.isFinite(achievement)
  ) {
    return null;
  }
  if (achievement >= 100) return "优";
  if (achievement >= 80) return "良";
  if (achievement >= 60) return "普";
  return "劣";
}

/** 单项评级；无实际值或标准非法时返回 null（不渲染标签） */
export function breakoutRating(
  actual: number | null | undefined,
  target: number,
): BreakoutRating | null {
  const achievement = breakoutAchievement(actual, target);
  const grade = breakoutGrade(achievement);
  if (achievement === null || grade === null) return null;
  return { grade, achievement };
}

/**
 * KPI 综合评级播放门槛（2026-09-30 改版，口径见 docs/数据口径.md 3.2）：
 * 播放 < 5,000 直接判劣；≥ 5,000 / 10,000 / 15,000 分别封顶普 / 良 / 优。
 */
export const KPI_PLAY_FLOOR = 5000;
export const KPI_PLAY_GOOD = 10000;
export const KPI_PLAY_EXCELLENT = 15000;

/** 档位从低到高，用于播放档位与指标综合档位取低 */
const GRADE_ORDER: readonly BreakoutGrade[] = ["劣", "普", "良", "优"];

/**
 * 综合评级：一个作品一个总评（优/良/普/劣），与三个单项标签并存。
 *
 * 1. 流量硬门槛：播放 < 5,000 直接判劣，不看指标。
 * 2. 指标综合：互动率与第四格达成率取平均，不封顶、不先取整；转粉率不参与。
 * 3. 播放封顶：指标综合档位与播放档位取低，播放只能限制上限，不能抬高评级。
 * 4. 缺数据不臆造：播放未采集，或播放已过门槛但任一参与项缺值 → null（不显示徽章）。
 *
 * 两项依次为互动率、第四格（干货收藏率 / 复盘及其他点赞率），来自 breakoutRating()。
 * 平均达成率复用 breakoutGrade() 的 100/80/60 档位，单项评级保持不变。
 */
export function overallBreakoutGrade(
  playCount: number | null | undefined,
  items: readonly [BreakoutRating | null, BreakoutRating | null],
): BreakoutGrade | null {
  if (playCount === null || playCount === undefined || !Number.isFinite(playCount)) {
    return null;
  }
  if (playCount < KPI_PLAY_FLOOR) return "劣";
  const [interaction, fourth] = items;
  if (!interaction || !fourth) return null;
  const averageAchievement = (interaction.achievement + fourth.achievement) / 2;
  const metricGrade = breakoutGrade(averageAchievement);
  if (metricGrade === null) return null;
  const playGrade: BreakoutGrade = playCount >= KPI_PLAY_EXCELLENT
    ? "优"
    : playCount >= KPI_PLAY_GOOD ? "良" : "普";
  return GRADE_ORDER[Math.min(GRADE_ORDER.indexOf(metricGrade), GRADE_ORDER.indexOf(playGrade))];
}

/** 达成率文案：四舍五入到整数百分比 */
export function formatAchievement(achievement: number | null | undefined): string {
  if (
    achievement === null ||
    achievement === undefined ||
    !Number.isFinite(achievement)
  ) {
    return "—";
  }
  return `${Math.round(achievement)}%`;
}
