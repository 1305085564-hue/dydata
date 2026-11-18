"use client";

import type { ReactNode } from "react";
import { KPI_PLAY_FLOOR } from "@/lib/breakout-rating";
import type { ContentQualitySummary } from "@/lib/collaboration/content-quality-contract";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { TableCellHint } from "@/components/admin/quality-tooltip-content";

export type WriterQualityData =
  | {
      state: "ready" | "error";
      summary: ContentQualitySummary | null;
    }
  | null
  | undefined;

export const COLLABORATION_METRIC_HEADER_TIPS = {
  effectiveCount: "播放大于 500 的作品条数",
  excellentCount: "播放至少 30,000 的作品条数",
  followerConversionRate: (
    <>
      <p className="font-normal text-[#141413] mb-1">转粉率（加权参考）：</p>
      <p className="text-[#1F1E1D] leading-relaxed">
        按已同步 24h 快照的涨粉合计 ÷ 播放合计计算，受高播作品权重影响；区别于右侧「互动数据」按作品算术平均（不按播放加权）。
      </p>
    </>
  ),
  interactionRate: (
    <>
      <p className="font-normal text-[#141413] mb-1">互动率（加权参考）：</p>
      <p className="text-[#1F1E1D] leading-relaxed">
        按已同步 24h 快照的（赞+评+转+藏）合计 ÷ 播放合计计算，受高播作品权重影响；区别于右侧「互动数据」按作品算术平均（不按播放加权）。
      </p>
    </>
  ),
  avgInteractionAchievement: (
    <>
      <p className="font-normal text-[#141413] mb-1">互动数据均值：</p>
      <p className="text-[#1F1E1D] leading-relaxed">
        有互动数据作品的互动指标达成率算术平均，不按播放加权。
      </p>
    </>
  ),
  avgContentAchievement: (
    <>
      <p className="font-normal text-[#141413] mb-1">留存数据均值：</p>
      <p className="text-[#1F1E1D] leading-relaxed">
        播放 2000 以上且算得出留存的作品，按好标准计算达成率后合成留存数据均值。
      </p>
    </>
  ),
  goodExcellentRate: (
    <>
      <p className="font-normal text-[#141413] mb-1">良优率口径：</p>
      <p className="text-[#1F1E1D] leading-relaxed">
        留存数据评级为良或优的署名日报篇数 ÷ 留存数据已评级署名日报篇数。<br />
        播放不足 {KPI_PLAY_FLOOR.toLocaleString()} 直接评普并计入良优率分母；无已评级作品时显示「—」。
      </p>
    </>
  ),
} satisfies Record<string, ReactNode>;

/** 文案表与达人表共用的质量三列（互动数据 / 留存数据 / 良优率）及五态悬停提示。 */
export function CollaborationQualityCells({
  writerQuality,
}: {
  writerQuality: WriterQualityData;
}) {
  return (
    <>
      <TableCell className="p-0 text-right tabular-nums text-[#1F1E1D]">
        {writerQuality ? (
          writerQuality.state === "error" ? (
            <TableCellHint tip="质量数据读取异常">
              <Badge variant="warning">异常</Badge>
            </TableCellHint>
          ) : writerQuality.summary?.avgInteractionAchievement != null ? (
            <TableCellHint
              tip={`互动数据样本 ${writerQuality.summary.interactionSampleCount} 篇`}
              muted={writerQuality.summary.interactionSampleCount < 3}
            >
              {Math.round(writerQuality.summary.avgInteractionAchievement)}%
            </TableCellHint>
          ) : (
            <TableCellHint tip="尚无互动数据完整样本" muted>
              —
            </TableCellHint>
          )
        ) : (
          <TableCellHint tip="质量数据尚未接入" muted>
            —
          </TableCellHint>
        )}
      </TableCell>
      <TableCell className="p-0 text-right tabular-nums text-[#1F1E1D]">
        {writerQuality ? (
          writerQuality.state === "error" ? (
            <TableCellHint tip="质量数据读取异常" muted>
              —
            </TableCellHint>
          ) : writerQuality.summary?.avgContentAchievement != null ? (
            <TableCellHint
              tip={`留存数据样本 ${writerQuality.summary.achievementSampleCount} 篇`}
              muted={writerQuality.summary.achievementSampleCount < 3}
            >
              {Math.round(writerQuality.summary.avgContentAchievement)}%
            </TableCellHint>
          ) : (
            <TableCellHint tip="尚无留存数据完整样本" muted>
              —
            </TableCellHint>
          )
        ) : (
          <TableCellHint tip="质量数据尚未接入" muted>
            —
          </TableCellHint>
        )}
      </TableCell>
      <TableCell className="p-0 text-right tabular-nums text-[#1F1E1D]">
        {writerQuality ? (
          writerQuality.state === "error" ? (
            <TableCellHint tip="质量数据读取异常" muted>
              —
            </TableCellHint>
          ) : writerQuality.summary &&
            writerQuality.summary.ratedCount > 0 &&
            writerQuality.summary.goodExcellentRate != null ? (
            <TableCellHint
              tip={`良优率分母 ${writerQuality.summary.ratedCount} 篇`}
              muted={writerQuality.summary.ratedCount < 3}
            >
              <span>
                {Math.round(writerQuality.summary.goodExcellentRate * 100)}%
                <span className="ml-1 text-[12px] text-[#78716C]">
                  {writerQuality.summary.ratedCount}/{writerQuality.summary.totalCount}篇
                </span>
              </span>
            </TableCellHint>
          ) : (
            <TableCellHint tip="尚无可评级作品或参评样本" muted>
              —
            </TableCellHint>
          )
        ) : (
          <TableCellHint tip="质量数据尚未接入" muted>
            —
          </TableCellHint>
        )}
      </TableCell>
    </>
  );
}
