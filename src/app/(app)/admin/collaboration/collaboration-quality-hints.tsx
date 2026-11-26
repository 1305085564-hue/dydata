"use client";

import type { ReactNode } from "react";
import { KPI_PLAY_EXCELLENT, KPI_PLAY_FLOOR } from "@/lib/breakout-rating";
import {
  formatRetentionValue,
  type ContentQualitySummary,
} from "@/lib/collaboration/content-quality-contract";
import {
  DEFAULT_EVALUATION_STANDARDS,
  contentAchievementTone,
  evaluationTone,
  evaluationToneClass,
  interactionRateTone,
  type EvaluationStandards,
  type EvaluationTone,
} from "@/lib/evaluation-standards";
import { CALIBER } from "@/lib/metrics/caliber";
import { OneTip } from "./one-tip";
import type { RoleColumn } from "./role-table";
import { formatBigNumber } from "@/lib/collaboration/types";
import { INTERACTION_DETAIL_COLUMNS, RETENTION_DETAIL_COLUMNS, formatRate } from "./work-group-detail-columns";

export type WriterQualityData =
  | {
      state: "ready" | "error";
      summary: ContentQualitySummary | null;
    }
  | null
  | undefined;

/** 列头口径：表下脚注全部收进这里，就近悬停可见。 */
export const COLLABORATION_METRIC_HEADER_TIPS = {
  reportCount: "按日报统计，含还没同步数据复盘的作品。",
  totalPlay: "本月作品播放合计（按日报填报的播放量）。",
  avgPlay: "总播放 ÷ 本月作品数。",
  excellentCount: `综合评级为「优」的署名作品条数。播放达到 ${KPI_PLAY_EXCELLENT.toLocaleString()} 以上、互动与留存均达标才可评优；未认证文案不计入结算。`,
  followerConversionRate:
    "参考指标：已同步 24 小时数据的涨粉合计 ÷ 播放合计，受高播作品影响大；未同步数据复盘的作品不参与。",
  interactionRate:
    "参考指标：已同步 24 小时数据的（赞＋评＋转＋藏）合计 ÷ 播放合计，受高播作品影响大；未同步数据复盘的作品不参与。",
  avgInteractionAchievement: "每条作品互动指标对标准线的达成率，按作品平均，不按播放加权。",
  avgContentAchievement: `播放 ${KPI_PLAY_FLOOR.toLocaleString()} 以上且算得出留存的作品，按好标准算达成率后取平均。`,
  goodExcellentRate: `综合评级为良或优的篇数 ÷ 已评级篇数。播放不足 ${KPI_PLAY_FLOOR.toLocaleString()} 直接评普，也计入分母。`,
  interactionDetail: "四项与互动率同口径：先加总再相除，四项相加等于互动率。",
  retentionDetail: `播放达到 ${KPI_PLAY_FLOOR.toLocaleString()} 且算得出留存的作品取平均，与「留存达成」同一批作品，不按播放加权。`,
} satisfies Record<string, ReactNode>;

const muted = "text-[#A8A29E]";

/** 单元格内容：数字 + 悬停说明样本量；样本不足 3 篇时数字降为信号墨。 */
function HintValue({ tip, dim = false, children }: { tip: string; dim?: boolean; children: ReactNode }) {
  return (
    <OneTip tip={tip}>
      <span className={`cursor-default ${dim ? muted : ""}`}>{children}</span>
    </OneTip>
  );
}

function qualityUnavailable(quality: WriterQualityData, emptyTip = "质量数据尚未接入"): ReactNode | null {
  if (!quality) return <HintValue tip={emptyTip} dim>—</HintValue>;
  if (quality.state === "error" || !quality.summary) {
    return (
      <HintValue tip="质量数据读取失败，刷新重试">
        <span className="text-[12px] text-[#78716C]">读取失败</span>
      </HintValue>
    );
  }
  return null;
}

function summaryOf(quality: WriterQualityData) {
  return quality && quality.state === "ready" ? quality.summary : null;
}

export type MetricToneOptions = {
  standards?: EvaluationStandards;
  /** 样本不足（不变红绿）的条均播放门槛；岗位表用公司 minPlayCount（默认 5,000），小队表用 2,000。 */
  minPlay?: number;
};

function resolveToneOptions(options?: MetricToneOptions) {
  const standards = options?.standards ?? DEFAULT_EVALUATION_STANDARDS;
  const minPlay = options?.minPlay ?? standards.minPlayCount;
  return { standards, minPlay };
}

function metricCellClass(avgPlay: number, minPlay: number, tone: EvaluationTone): string {
  return evaluationToneClass(tone, avgPlay < minPlay);
}

/** 互动达成 / 留存达成 / 良优率：文案表与达人表共用。 */
export function qualityColumns<R extends { avgPlay: number }>(
  getQuality: (row: R) => WriterQualityData,
  rulesEntry?: ReactNode,
  emptyTip?: string,
  toneOptions?: MetricToneOptions,
): RoleColumn<R>[] {
  const { standards, minPlay } = resolveToneOptions(toneOptions);
  return [
    {
      key: "avgInteractionAchievement",
      label: "互动达成",
      tip: COLLABORATION_METRIC_HEADER_TIPS.avgInteractionAchievement,
      width: 72,
      sortValue: (row) => summaryOf(getQuality(row))?.avgInteractionAchievement ?? null,
      cellClassName: (row) => {
        const value = summaryOf(getQuality(row))?.avgInteractionAchievement;
        if (value == null) return "";
        return metricCellClass(row.avgPlay, minPlay, evaluationTone("interactionAchievement", value, undefined, standards));
      },
      render: (row) => {
        const quality = getQuality(row);
        const blocked = qualityUnavailable(quality, emptyTip);
        if (blocked) return blocked;
        const summary = quality!.summary!;
        if (summary.avgInteractionAchievement == null) {
          return <HintValue tip="还没有互动数据完整的作品" dim>—</HintValue>;
        }
        const lowPlayTip = row.avgPlay < minPlay ? ` · 条均播放不足 ${minPlay.toLocaleString("zh-CN")}，不标好坏` : "";
        return (
          <HintValue tip={`按 ${summary.interactionSampleCount} 篇有互动数据的作品平均${lowPlayTip}`}>
            {Math.round(summary.avgInteractionAchievement)}%
          </HintValue>
        );
      },
    },
    {
      key: "avgContentAchievement",
      label: "留存达成",
      tip: COLLABORATION_METRIC_HEADER_TIPS.avgContentAchievement,
      width: 72,
      sortValue: (row) => summaryOf(getQuality(row))?.avgContentAchievement ?? null,
      cellClassName: (row) => {
        const value = summaryOf(getQuality(row))?.avgContentAchievement;
        if (value == null) return "";
        return metricCellClass(row.avgPlay, minPlay, contentAchievementTone(value));
      },
      render: (row) => {
        const quality = getQuality(row);
        const blocked = qualityUnavailable(quality, emptyTip);
        if (blocked) return blocked;
        const summary = quality!.summary!;
        if (summary.avgContentAchievement == null) {
          return <HintValue tip="还没有算得出留存的作品" dim>—</HintValue>;
        }
        const lowPlayTip = row.avgPlay < minPlay ? ` · 条均播放不足 ${minPlay.toLocaleString("zh-CN")}，不标好坏` : "";
        return (
          <HintValue tip={`按 ${summary.achievementSampleCount} 篇算得出留存的作品平均${lowPlayTip}`}>
            {Math.round(summary.avgContentAchievement)}%
          </HintValue>
        );
      },
    },
    {
      key: "goodExcellentRate",
      label: "良优率",
      tip: COLLABORATION_METRIC_HEADER_TIPS.goodExcellentRate,
      headExtra: rulesEntry,
      width: 80,
      sortValue: (row) => {
        const summary = summaryOf(getQuality(row));
        return summary && summary.ratedCount > 0 ? summary.goodExcellentRate : null;
      },
      render: (row) => {
        const quality = getQuality(row);
        const blocked = qualityUnavailable(quality, emptyTip);
        if (blocked) return blocked;
        const summary = quality!.summary!;
        if (summary.ratedCount === 0 || summary.goodExcellentRate == null) {
          return <HintValue tip="还没有已评级的作品" dim>—</HintValue>;
        }
        return (
          <HintValue
            tip={`已评级 ${summary.ratedCount} 篇（本月共 ${summary.totalCount} 篇）`}
            dim={summary.ratedCount < 3}
          >
            {Math.round(summary.goodExcellentRate * 100)}%
          </HintValue>
        );
      },
    },
  ];
}

/** 文案表「优条数」：综合评级为优的条数；数据缺失或读取失败时说清原因，不折算成 0。 */
export function excellentCountColumn<R>(getQuality: (row: R) => WriterQualityData): RoleColumn<R> {
  return {
    key: "excellentCount",
    label: "优条数",
    tip: COLLABORATION_METRIC_HEADER_TIPS.excellentCount,
    width: 64,
    sortValue: (row) => summaryOf(getQuality(row))?.overallGradeCounts.excellent ?? null,
    render: (row) => {
      const quality = getQuality(row);
      const blocked = qualityUnavailable(quality);
      if (blocked) return blocked;
      const { overallGradeCounts, ratedCount } = quality!.summary!;
      return (
        <HintValue tip={`已评级 ${ratedCount} 篇中，评为优 ${overallGradeCounts.excellent} 篇`}>
          {overallGradeCounts.excellent}
        </HintValue>
      );
    },
  };
}

type VolumeRow = { reportCount: number; totalPlay: number; avgPlay: number };

type VolumeTips = Partial<Record<"reportCount" | "totalPlay" | "avgPlay", ReactNode>>;

/** 本月作品 / 总播放 / 条均播放：所有表同一套；小队按快照统计，口径说明可替换。 */
export function volumeColumns<R extends VolumeRow>(tips: VolumeTips = {}): RoleColumn<R>[] {
  return [
    {
      key: "reportCount",
      label: "本月作品",
      tip: tips.reportCount ?? COLLABORATION_METRIC_HEADER_TIPS.reportCount,
      width: 72,
      sortValue: (row) => row.reportCount,
      render: (row) => row.reportCount,
    },
    {
      key: "totalPlay",
      label: "总播放",
      tip: tips.totalPlay ?? COLLABORATION_METRIC_HEADER_TIPS.totalPlay,
      width: 72,
      sortValue: (row) => row.totalPlay,
      render: (row) => formatBigNumber(row.totalPlay),
    },
    {
      key: "avgPlay",
      label: "条均播放",
      tip: tips.avgPlay ?? COLLABORATION_METRIC_HEADER_TIPS.avgPlay,
      width: 72,
      sortValue: (row) => row.avgPlay,
      render: (row) => formatBigNumber(row.avgPlay),
    },
  ];
}

type RateRow = { avgPlay: number; followerConversionRate: number | null; interactionRate: number | null };

/** 转粉率 / 互动率（参考指标，按播放加权）；互动率按评价标准标红绿，转粉率不上色。 */
export function rateColumns<R extends RateRow>(toneOptions?: MetricToneOptions): RoleColumn<R>[] {
  const { standards, minPlay } = resolveToneOptions(toneOptions);
  return [
    {
      key: "followerConversionRate",
      label: "转粉率",
      tip: COLLABORATION_METRIC_HEADER_TIPS.followerConversionRate,
      width: 64,
      sortValue: (row) => row.followerConversionRate,
      render: (row) => formatRate(row.followerConversionRate),
    },
    {
      key: "interactionRate",
      label: "互动率",
      tip: COLLABORATION_METRIC_HEADER_TIPS.interactionRate,
      width: 64,
      sortValue: (row) => row.interactionRate,
      cellClassName: (row) => {
        if (row.interactionRate == null) return "";
        return metricCellClass(row.avgPlay, minPlay, interactionRateTone(row.interactionRate, undefined, standards));
      },
      render: (row) => formatRate(row.interactionRate),
    },
  ];
}

type InteractionDetailRow = {
  likeRate?: number | null;
  commentRate?: number | null;
  shareRate?: number | null;
  favoriteRate?: number | null;
};

function formatDetailRate(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/** 展开明细·互动四项：与小队表同一份列定义与口径。 */
export function interactionDetailColumns<R extends InteractionDetailRow>(): RoleColumn<R>[] {
  return INTERACTION_DETAIL_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    tip: COLLABORATION_METRIC_HEADER_TIPS.interactionDetail,
    width: 64,
    sortValue: (row: R) => row[column.key] ?? null,
    render: (row: R) => formatDetailRate(row[column.key]),
  }));
}

const RETENTION_DETAIL_WIDTHS: Record<(typeof RETENTION_DETAIL_COLUMNS)[number]["key"], number> = {
  bounceRate2s: 74,
  completionRate5s: 74,
  avgPlayDuration: 68,
  avgPlayRatio: 68,
  completionRate: 80,
};

/** 展开明细·留存五项：与小队表同一份列定义与口径，按评价标准好红差绿上色。 */
export function retentionDetailColumns<R extends { avgPlay: number }>(
  getQuality: (row: R) => WriterQualityData,
  toneOptions?: MetricToneOptions,
): RoleColumn<R>[] {
  const { standards, minPlay } = resolveToneOptions(toneOptions);
  return RETENTION_DETAIL_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    tip: COLLABORATION_METRIC_HEADER_TIPS.retentionDetail,
    width: RETENTION_DETAIL_WIDTHS[column.key],
    cellClassName: (row: R) => {
      const value = summaryOf(getQuality(row))?.retentionAverages?.[column.key];
      if (value == null) return "";
      return metricCellClass(row.avgPlay, minPlay, evaluationTone(column.key, value, undefined, standards));
    },
    render: (row: R) =>
      formatRetentionValue(summaryOf(getQuality(row))?.retentionAverages?.[column.key], column.unit),
  }));
}

/** 小队口径：播放取每条作品最新 24 小时快照，先加总再相除（与数据复盘抽屉同源）。 */
export const TEAM_VOLUME_TIPS: VolumeTips = {
  reportCount: "当月作品总数，含还没同步数据复盘的作品。",
  totalPlay: "每条作品最新 24 小时快照的播放合计；还没同步数据复盘的作品不计。",
  avgPlay: "总播放 ÷ 已同步数据复盘的作品数。",
};

type TeamMetricRow = {
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  followerConversionRate: number | null;
  interactionRate: number | null;
  likeRate: number | null;
  commentRate: number | null;
  shareRate: number | null;
  favoriteRate: number | null;
  contentQuality: ContentQualitySummary | null;
};

const teamQuality = (row: TeamMetricRow): WriterQualityData =>
  row.contentQuality ? { state: "ready", summary: row.contentQuality } : null;

/** 小队列表与小队详情的列：与文案表同一套列名和口径，只是播放按快照统计，上色门槛为 2,000。 */
export function teamMetricColumns<R extends TeamMetricRow>({
  showDetail,
  withQuality,
  standards,
}: {
  showDetail: boolean;
  withQuality: boolean;
  standards?: EvaluationStandards;
}): RoleColumn<R>[] {
  const getQuality = (row: R) => teamQuality(row);
  const toneOptions: MetricToneOptions = {
    standards,
    minPlay: CALIBER.effectiveMinPlay,
  };
  return [
    ...volumeColumns<R>(TEAM_VOLUME_TIPS),
    ...rateColumns<R>(toneOptions),
    ...(showDetail ? interactionDetailColumns<R>() : []),
    ...(withQuality ? qualityColumns<R>(getQuality, undefined, "运营小队不评级", toneOptions) : []),
    ...(withQuality && showDetail ? retentionDetailColumns<R>(getQuality, toneOptions) : []),
  ];
}
