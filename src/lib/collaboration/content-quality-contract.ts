import type { BreakoutGrade } from "@/lib/breakout-rating";

/**
 * 话题内容目标标准线（阈值为 0–1 小数，例如 0.035 表示 3.5%）。
 * 由后端动态下发，前端不硬编码任何具体比率。
 */
export interface TopicQualityTargets {
  /** 互动率标准线 */
  interaction: number;
  /** 核心指标标准线：干货为收藏率，复盘及其他为点赞率 */
  core: number;
}

/**
 * 目标规则与门槛配置（由后端根据现行标准下发，前端不写死任何数字）。
 * 包含达成率分档基准线（如优/良/普参考线）以及 KPI 播放门槛。
 */
export interface ContentQualityRules {
  /** 干货标准线 */
  dryGoods: TopicQualityTargets;
  /** 复盘及其他标准线 */
  review: TopicQualityTargets;
  /**
   * 达成率分档阈值（百分数数值，例如 100、80、60 分别对应优/良/普）。
   * 前端图表依据此 props 动态绘制参考线与档位标签，严禁写死数字。
   */
  gradeThresholds: {
    excellent: number;
    good: number;
    fair: number;
  };
  /**
   * KPI 播放硬门槛（播放量绝对值，例如 5000/10000/15000）。
   */
  playFloors: {
    floor: number;
    good: number;
    excellent: number;
  };
}

/**
 * 单篇内容质量可用性状态（主方案 §3.3 规范）。
 * 精确区分各类未就绪场景，禁止将未就绪统一推断为「未满 24 小时」。
 */
export type ContentQualityStatus =
  | "rated" // 正常评级计算完成
  | "unlinked" // 未关联视频（无 video_id）
  | "pending_snapshot" // 数据待采集（没有 24h 快照）
  | "invalid_play" // 播放量为 0 或缺失（不可计算）
  | "missing_metrics" // 参与项缺失（缺互动/点赞/收藏）
  | "topic_unavailable"; // 话题分类状态未就绪或读取失败

/** 列表筛选使用的综合评级枚举；unrated 覆盖 overallGrade 为空的真实状态。 */
export type ContentQualityGradeFilter =
  | "all"
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "unrated";

/**
 * 单篇作品内容质量目标与评级详情。
 * 单位规范：
 * - 原始比率（如有引用）为 0–1 小数；
 * - 达成率为百分数数值（88.5 表示 88.5%，不封顶、不提前取整）；
 * - snapshotPlayCount 为最新 24h 快照原值，不可使用补零或日报回退值计算。
 */
export interface WorkContentQuality {
  /** 话题分类：dry_goods 干货 / review 复盘 / other 其他 / null 尚未识别 */
  topicKind: "dry_goods" | "review" | "other" | null;
  /** 核心关注指标：干货为 favoriteRate，复盘及其他为 likeRate */
  coreMetric: "favoriteRate" | "likeRate" | null;
  /** 最新 24h 快照播放量原值 */
  snapshotPlayCount: number | null;
  /** 互动达成率（百分数数值：如 88.5 表示 88.5%，不封顶） */
  interactionAchievement: number | null;
  /** 核心指标达成率（百分数数值：收藏或点赞达成率，不封顶） */
  coreAchievement: number | null;
  /** 两项平均内容达成率（百分数数值，不封顶） */
  contentAchievement: number | null;
  /** 指标档位（不含播放兜底，仅由两项平均达成率映射） */
  contentGrade: BreakoutGrade | null;
  /** 综合评级（含播放兜底，overallBreakoutGrade 计算结果） */
  overallGrade: BreakoutGrade | null;
  /** 计算可用性状态 */
  status: ContentQualityStatus;
}

/**
 * 质量汇总统计（月度与近 30 天通用）。
 * 两个明确样本集：
 * 1. 达成率均值样本集：两项指标均完整可计算的作品（achievementSampleCount）；
 * 2. 综合良优率样本集：综合评级非空的作品（ratedCount）。
 * 当 ratedCount === 0 时，goodExcellentRate 为 null，展示「—」；只有 ratedCount > 0 且良优数为 0 时才为 0。
 */
export interface ContentQualitySummary {
  /** 署名日报作品总数 */
  totalCount: number;
  /** 两项指标均完整可计算的作品数（均值分母） */
  achievementSampleCount: number;
  /** 综合评级非空的作品数（良优率分母） */
  ratedCount: number;
  /** 未评级原因计数（仅统计综合评级为空的作品） */
  unratedReasons: {
    unlinked: number;
    pendingSnapshot: number;
    invalidPlay: number;
    missingMetrics: number;
    topicUnavailable: number;
  };
  /** 互动达成率均值（百分数数值，如 92.4 表示 92.4%） */
  avgInteractionAchievement: number | null;
  /** 核心指标达成率均值（百分数数值） */
  avgCoreAchievement: number | null;
  /** 内容达成率均值（百分数数值） */
  avgContentAchievement: number | null;
  /** 综合优/良/普/劣件数计数 */
  overallGradeCounts: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  /** 综合良优率（0–1 小数，例如 0.65 表示 65%）；无参评样本时为 null */
  goodExcellentRate: number | null;
}

/**
 * 个人抽屉中专属的「本月文案作品」明细项。
 * 仅包含本人文案署名的作品。
 */
export interface PersonWriterWorkItem {
  reportId: string;
  videoId: string | null;
  reportDate: string;
  accountId: string;
  accountName: string;
  title: string;
  playCount: number | null;
  dataSource?: "ai" | "manual" | null;
  /** 原始比率（0–1 小数） */
  interactionRate: number | null;
  likeRate: number | null;
  favoriteRate: number | null;
  /** 内容质量详情 */
  contentQuality: WorkContentQuality | null;
}

export type WriterQualityState = "ready" | "error";

/**
 * 个人档案数据中的文案专属质量数据块。
 */
export interface PersonWriterQuality {
  state: WriterQualityState;
  /** 后端下发的质量规则与基准线 */
  rules?: ContentQualityRules;
  /** 所选月份文案汇总 */
  monthSummary: ContentQualitySummary | null;
  /** 所选月份本人文案作品列表 */
  monthWorks: PersonWriterWorkItem[];
  /** 近 30 天近况汇总 */
  growthSummary: ContentQualitySummary | null;
}

/**
 * 根据 status 获取精准未就绪说明文案（主方案 §3.3 规范，严禁统一写成未满24小时）。
 */
export function getContentQualityStatusText(status: ContentQualityStatus): string {
  switch (status) {
    case "unlinked":
      return "未关联视频";
    case "pending_snapshot":
      return "数据待采集";
    case "invalid_play":
      return "播放不可计算";
    case "missing_metrics":
      return "指标数据缺失";
    case "topic_unavailable":
      return "分类状态未就绪";
    case "rated":
      return "已评级";
    default:
      return "数据未就绪";
  }
}
