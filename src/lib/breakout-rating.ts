import type { VideoTopicKind } from "@/lib/topics/library";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

/**
 * 爆款标准线（按视频「话题」分类，阈值为小数）。
 * 核心指标按话题各取其一（干货收藏率 / 复盘点赞率），但两套阈值数值相同；
 * 互动率与转粉率两套通用。
 * 2026-10-09 调整（阿禅定稿，依据近两月播放≥1.5万作品分布，见
 * docs/archive/2026-11-09-A批文档治理/计划原稿/2026-10-09-复盘干货爆款标准线数据分析与建议.md）：
 * 干货互动率 3.5% → 3.2%、收藏率 1.8% → 2%；复盘互动率 3% → 3.2%、点赞率保持 2%。
 * 2026-10-12 调整（阿禅定稿）：互动率统一 3.2% → 3.5%，其余未动。
 * 评级档位（达成率 100/80/60）未动。
 */
export interface BreakoutTargets {
  /** 互动率标准线 */
  interaction: number;
  /** 转粉率标准线（两套通用） */
  follower: number;
}

export const BREAKOUT_TARGETS: Record<"dry_goods" | "review", BreakoutTargets> = {
  dry_goods: { interaction: 0.035, follower: 0.01 },
  review: { interaction: 0.035, follower: 0.01 },
};

export type BreakoutGrade = "优" | "良" | "普";
/**
 * 纯文字状态色，供表格、标签和图表统一使用。
 * 注：2026-09-22 删除已无消费方的胶囊底色版 `BREAKOUT_GRADE_CLASS`
 * （其注释写「优=成功绿 / 劣=异常红」，与实际配色语义相反，留着会读错）
 */
export const BREAKOUT_GRADE_TEXT_CLASS: Record<BreakoutGrade, string> = {
  优: "text-[#7E5C99]", // 藕紫
  良: "text-[#A85A6B]", // 陈玫
  普: "text-[#6F6B2F]", // 深苔橄榄
};

export interface BreakoutRating {
  grade: BreakoutGrade;
  /** 达成率百分比，不封顶 */
  achievement: number;
}

/**
 * 话题分类是否「已识别」——只有三种已知分类算已识别。
 * null（状态未取到）与 undefined（调用方未传）都不算：此时不能按复盘口径出数，
 * 否则「还没拿到分类」会被静默当成复盘，核心指标显示成点赞率而真假难辨。
 */
export function hasKnownTopicKind(
  topicKind: VideoTopicKind | null | undefined,
): topicKind is VideoTopicKind {
  return topicKind === "dry_goods" || topicKind === "review" || topicKind === "other";
}

/** 该话题对应的标准线；无标签（other）与复盘同口径，与大盘核心指标一致 */
export function breakoutTargetsFor(
  topicKind: VideoTopicKind | null | undefined,
  standards?: EvaluationStandards,
): BreakoutTargets {
  if (standards) {
    return {
      interaction: standards.targets.interactionRate / 100,
      follower: standards.targets.followerRate / 100,
    };
  }
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

/** 评级：≥100 优、≥80 良，其余普。三档评级不再产生劣。 */
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
  if (achievement >= BREAKOUT_GRADE_THRESHOLDS.excellent) return "优";
  if (achievement >= BREAKOUT_GRADE_THRESHOLDS.good) return "良";
  return "普";
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
 * KPI 综合评级播放门槛（口径见 docs/系统架构与设计/数据口径与计算规则.md 3.2）：
 * 播放 < 2,000 直接判普；5,000 以下最高普，5,000–14,999 最高良，15,000 以上不封顶。
 * 2026-11-13 调整（阿禅）：普线 5,000 → 2,000；良线与优线同为 15,000。
 */
export const KPI_PLAY_FLOOR = 2000;
export const KPI_PLAY_GOOD = 5000;
export const KPI_PLAY_EXCELLENT = 15000;

/** 达成率档位阈值（百分数），供内容质量后端下发给展示层。 */
export const BREAKOUT_GRADE_THRESHOLDS = {
  excellent: 100,
  good: 80,
  fair: 60,
} as const;

/** 档位从低到高，用于播放档位与指标综合档位取低 */
const GRADE_ORDER: readonly BreakoutGrade[] = ["普", "良", "优"];

/**
 * 强项最多能把较差项拉高的档位数（2026-10-12 阿禅定稿，防过度偏科）：
 * 综合指标档 = min(两项平均达成率档位, 较差单项档位 + 本值)。
 * 取值 1 时等价于：要拿优，两项都不能低于「良」（≥80%）；要拿良，两项都不能低于「普」（≥60%）。
 * 极端例：200% + 0%，平均 100% 名义为优，但较差项不足 60%，综合最多为普。
 */
export const MAX_PULL_GRADES = 1;

export type RatingRule = {
  playFloor: number;
  playGood: number;
  playExcellent: number;
  excellent: number;
  good: number;
  fair: number;
  maxPull: number;
};

export const DEFAULT_RATING_RULE: RatingRule = {
  playFloor: KPI_PLAY_FLOOR,
  playGood: KPI_PLAY_GOOD,
  playExcellent: KPI_PLAY_EXCELLENT,
  excellent: BREAKOUT_GRADE_THRESHOLDS.excellent,
  good: BREAKOUT_GRADE_THRESHOLDS.good,
  fair: BREAKOUT_GRADE_THRESHOLDS.fair,
  maxPull: MAX_PULL_GRADES,
};

/** 取较低档位（依赖 GRADE_ORDER 由低到高的顺序） */
function lowerGrade(a: BreakoutGrade, b: BreakoutGrade): BreakoutGrade {
  return GRADE_ORDER[Math.min(GRADE_ORDER.indexOf(a), GRADE_ORDER.indexOf(b))];
}

/**
 * 综合评级：一个作品一个总评（优/良/普），与两个单项标签并存。
 *
 * 1. 流量硬门槛：播放为 0 或无效时未评级；播放 < 2,000 直接判普，不看指标。
 * 2. 指标综合：互动达成率与留存达成率取平均，不封顶、不先取整；转粉率不参与。
 * 3. 偏科保护：要拿优两项都需 ≥80%，要拿良两项都需 ≥60%。
 * 4. 播放封顶：指标档位与播放档位取低，播放只能限制上限，不能抬高评级。
 * 5. 缺数据不臆造：播放未采集，或播放已过门槛但任一参与项缺值 → null（不显示徽章）。
 *
 * 两项依次为互动达成率、留存达成率，来自 breakoutRating()。
 * 单项评级保持原样（各自显示自己的档位与达成率），只有综合总评受上述约束。
 */
export function overallBreakoutGrade(
  playCount: number | null | undefined,
  items: readonly [BreakoutRating | null, BreakoutRating | null],
  rule: RatingRule = DEFAULT_RATING_RULE,
): BreakoutGrade | null {
  if (playCount === null || playCount === undefined || !Number.isFinite(playCount)) {
    return null;
  }
  if (playCount < 0) return items[0] && items[1] ? "普" : null;
  if (playCount === 0) return null;
  if (playCount < rule.playFloor) return "普";
  const [interaction, retention] = items;
  if (!interaction || !retention) return null;
  const averageAchievement = (interaction.achievement + retention.achievement) / 2;
  const metricGrade: BreakoutGrade = averageAchievement >= rule.excellent
    ? "优"
    : averageAchievement >= rule.good ? "良" : "普";
  const weakAchievement = Math.min(interaction.achievement, retention.achievement);
  const weakGradeIndex = weakAchievement < rule.fair
    ? -1
    : weakAchievement < rule.good ? 0 : weakAchievement < rule.excellent ? 1 : 2;
  const pullCapGrade: BreakoutGrade = GRADE_ORDER[Math.max(
    0,
    Math.min(weakGradeIndex + rule.maxPull, GRADE_ORDER.length - 1),
  )];
  const cappedMetricGrade = lowerGrade(metricGrade, pullCapGrade);
  const playGrade: BreakoutGrade = playCount >= rule.playExcellent
    ? "优"
    : playCount >= rule.playGood ? "良" : "普";
  return lowerGrade(cappedMetricGrade, playGrade);
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
