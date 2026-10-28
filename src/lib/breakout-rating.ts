import type { VideoTopicKind } from "@/lib/topics/library";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

/**
 * 爆款标准线（按视频「话题」分类，阈值为小数）。
 * 第四格按话题各取其一（干货收藏率 / 复盘点赞率），但两套阈值数值相同；
 * 互动率与转粉率两套通用。
 * 2026-10-09 调整（阿禅定稿，依据近两月播放≥1.5万作品分布，见
 * docs/plans/2026-10-09-复盘干货爆款标准线数据分析与建议.md）：
 * 干货互动率 3.5% → 3.2%、收藏率 1.8% → 2%；复盘互动率 3% → 3.2%、点赞率保持 2%。
 * 2026-10-12 调整（阿禅定稿）：互动率统一 3.2% → 3.5%，其余未动。
 * 评级档位（达成率 100/80/60）未动。
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
  // 干货：互动率 3.5%、收藏率 2%、转粉率 1%
  dry_goods: { interaction: 0.035, fourth: 0.02, follower: 0.01 },
  // 复盘：互动率 3.5%、点赞率 2%、转粉率 1%（2026-10-09 起与干货同数值）
  review: { interaction: 0.035, fourth: 0.02, follower: 0.01 },
};

export type BreakoutGrade = "优" | "良" | "普" | "劣";
/**
 * 纯文字状态色（优藕紫、良陈玫、普深苔橄榄、劣深青瓷，小字下清晰扎实）
 * 评级文字与图表四色共用，普/劣已加深到 12px 白底与卡片底均 ≥4.5:1
 * 注：2026-09-22 删除已无消费方的胶囊底色版 `BREAKOUT_GRADE_CLASS`
 * （其注释写「优=成功绿 / 劣=异常红」，与实际配色语义相反，留着会读错）
 */
export const BREAKOUT_GRADE_TEXT_CLASS: Record<BreakoutGrade, string> = {
  优: "text-[#7E5C99]", // 藕紫
  良: "text-[#A85A6B]", // 陈玫
  普: "text-[#6F6B2F]", // 深苔橄榄
  劣: "text-[#2F6F66]", // 深青瓷
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
  standards?: EvaluationStandards,
): BreakoutTargets {
  if (standards) {
    return {
      interaction: standards.targets.interactionRate / 100,
      fourth: (topicKind === "dry_goods"
        ? standards.targets.dryFavoriteRate
        : standards.targets.reviewLikeRate) / 100,
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
  if (achievement >= BREAKOUT_GRADE_THRESHOLDS.excellent) return "优";
  if (achievement >= BREAKOUT_GRADE_THRESHOLDS.good) return "良";
  if (achievement >= BREAKOUT_GRADE_THRESHOLDS.fair) return "普";
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
 * KPI 综合评级播放门槛（口径见 docs/业务逻辑/数据口径与计算规则.md 3.2）：
 * 播放 < 5,000 直接判劣；≥ 5,000 封顶普；≥ 15,000 不设上限（能否到良/优由指标档位决定）。
 * 2026-10-24 调整（阿禅）：普线 2,000 → 5,000——5,000 以内的数据不参与爆款/优秀作品评选；
 * 良线与优线同为 15,000（2026-10-12 定稿），播放档位只剩「劣 / 普 / 不封顶」三种。
 * 5,000 这个值待数据分布复核后由阿禅最终确认（见 docs/plans/2026-10-24-播放与指标数据分布实测.md）。
 */
export const KPI_PLAY_FLOOR = 5000;
export const KPI_PLAY_GOOD = 15000;
export const KPI_PLAY_EXCELLENT = 15000;

/** 达成率档位阈值（百分数），供内容质量后端下发给展示层。 */
export const BREAKOUT_GRADE_THRESHOLDS = {
  excellent: 100,
  good: 80,
  fair: 60,
} as const;

/** 档位从低到高，用于播放档位与指标综合档位取低 */
const GRADE_ORDER: readonly BreakoutGrade[] = ["劣", "普", "良", "优"];

/**
 * 强项最多能把较差项拉高的档位数（2026-10-12 阿禅定稿，防过度偏科）：
 * 综合指标档 = min(两项平均达成率档位, 较差单项档位 + 本值)。
 * 取值 1 时等价于：要拿优，两项都不能低于「良」（≥80%）；要拿良，两项都不能低于「普」（≥60%）。
 * 极端例：200% + 0%，平均 100% 名义为优，但较差项是劣、最多拉到普 → 综合指标档为普。
 */
export const MAX_PULL_GRADES = 1;

/** 取较低档位（依赖 GRADE_ORDER 由低到高的顺序） */
function lowerGrade(a: BreakoutGrade, b: BreakoutGrade): BreakoutGrade {
  return GRADE_ORDER[Math.min(GRADE_ORDER.indexOf(a), GRADE_ORDER.indexOf(b))];
}

/**
 * 综合评级：一个作品一个总评（优/良/普/劣），与三个单项标签并存。
 *
 * 1. 流量硬门槛：播放 < 5,000 直接判劣，不看指标。
 * 2. 指标综合：互动率与第四格达成率取平均，不封顶、不先取整；转粉率不参与。
 * 3. 拉分封顶：较差的那一项最多被强项拉高 MAX_PULL_GRADES（当前 1）个档位——
 *    即「要拿优，两项都不能低于良；要拿良，两项都不能低于普」，防止一项极高把另一项的低分抹平。
 * 4. 播放封顶：上面得到的指标档位与播放档位取低，播放只能限制上限，不能抬高评级。
 *    （播放档位：≥ 15,000 优，其余普；良线与优线同为 15,000，
 *    故播放实际只能封到「普」，能否到良/优由指标档位决定。）
 * 5. 缺数据不臆造：播放未采集，或播放已过门槛但任一参与项缺值 → null（不显示徽章）。
 *
 * 两项依次为互动率、第四格（干货收藏率 / 复盘及其他点赞率），来自 breakoutRating()。
 * 单项评级保持原样（各自显示自己的档位与达成率），只有综合总评受上述约束。
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
  const weakerGrade = lowerGrade(interaction.grade, fourth.grade);
  const pullCap = GRADE_ORDER[
    Math.min(GRADE_ORDER.indexOf(weakerGrade) + MAX_PULL_GRADES, GRADE_ORDER.length - 1)
  ];
  const cappedMetricGrade = lowerGrade(metricGrade, pullCap);
  const playGrade: BreakoutGrade = playCount >= KPI_PLAY_EXCELLENT
    ? "优"
    : playCount >= KPI_PLAY_GOOD ? "良" : "普";
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
