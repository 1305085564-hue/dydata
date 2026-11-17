"use client";

import type { ReactNode } from "react";
import {
  getContentQualityStatusText,
  retentionSubMetricDetails,
  type ContentQualityRules,
  type WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { formatBigNumber } from "@/app/(app)/admin/collaboration/types";
import { SimpleTooltip } from "@/components/ui/tooltip";

export function InteractionBreakdownContent({
  quality,
  playCount,
  rules,
  extraNote,
}: {
  quality: WorkContentQuality | null | undefined;
  playCount: number | null | undefined;
  rules: ContentQualityRules | null | undefined;
  extraNote?: string;
}) {
  const achPct =
    quality?.interactionAchievement != null
      ? Math.round(quality.interactionAchievement)
      : null;
  const rateText =
    quality?.interactionValue != null
      ? `${(quality.interactionValue * 100).toFixed(2)}%`
      : null;
  const targetRate =
    rules == null
      ? null
      : quality?.topicKind === "dry_goods"
        ? rules.dryGoods.interaction
        : rules.review.interaction;
  const effectivePlay = quality?.snapshotPlayCount ?? playCount;
  const m = quality?.interactionMetrics;

  const items: Array<{ label: string; value: number | null | undefined }> = m
    ? [
        { label: "点赞", value: m.likes },
        { label: "评论", value: m.comments },
        { label: "转发", value: m.shares },
        { label: "收藏", value: m.favorites },
      ]
    : [];

  return (
    <>
      <div className="flex items-center justify-between border-b border-[#E2E2DF]/80 pb-1">
        <span className="text-[12px] text-[#141413]">
          {achPct != null ? `互动达成 ${achPct}%` : "互动明细"}
        </span>
        {rateText ? (
          <span className="text-[12px] text-[#78716C] tabular-nums">
            互动率 {rateText}
          </span>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item) => {
            const count = item.value;
            const pct =
              count != null && effectivePlay != null && effectivePlay > 0
                ? `${((count / effectivePlay) * 100).toFixed(2)}%`
                : "—";
            return (
              <div
                key={item.label}
                className="flex items-center justify-between gap-2 text-[12px] tabular-nums"
              >
                <span className="text-[#78716C]">{item.label}</span>
                <span className="inline-flex items-center gap-2">
                  <span className="text-[#141413]">
                    {count == null ? "—" : count.toLocaleString("zh-CN")}
                  </span>
                  <span className="w-[48px] text-right text-[#78716C]">{pct}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {targetRate != null ? (
        <div className="flex items-center justify-between border-t border-[#E2E2DF]/80 pt-1 text-[12px] text-[#78716C] tabular-nums">
          <span>目标标准线</span>
          <span>{(targetRate * 100).toFixed(2)}%</span>
        </div>
      ) : null}
      {extraNote ? (
        <div className="text-[12px] text-[#78716C] leading-snug">{extraNote}</div>
      ) : null}
    </>
  );
}

export function RetentionBreakdownContent({
  quality,
  rules,
}: {
  quality: WorkContentQuality | null | undefined;
  rules: ContentQualityRules | null | undefined;
}) {
  const totalPct =
    quality?.contentAchievement != null
      ? Math.round(quality.contentAchievement)
      : null;
  const calcNote =
    quality?.retentionCalculation === "avg_play_duration_only"
      ? "按均播折算"
      : quality?.retentionCalculation === "avg_play_ratio_only"
        ? "按占比折算"
        : null;
  const details = retentionSubMetricDetails(quality?.retentionMetrics, rules);

  return (
    <>
      <div className="flex items-center justify-between border-b border-[#E2E2DF]/80 pb-1">
        <span className="text-[12px] text-[#141413]">
          {totalPct != null ? `留存达成 ${totalPct}%` : "留存明细"}
        </span>
        {calcNote ? (
          <span className="text-[12px] text-[#78716C]">{calcNote}</span>
        ) : null}
      </div>
      {details.length > 0 ? (
        <div className="space-y-1">
          {details.map((item) => {
            const dotClass =
              item.status === "poor"
                ? "bg-status-danger"
                : item.status === "good"
                  ? "bg-status-success"
                  : "bg-[#D6D3D1]";
            const achText =
              item.achievement != null ? `达成 ${item.achievement}%` : "未回传";
            const achColor =
              item.status === "poor"
                ? "text-status-danger"
                : item.status === "good"
                  ? "text-status-success-text"
                  : "text-[#78716C]";

            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 text-[12px] tabular-nums"
              >
                <span className="inline-flex items-center gap-1 text-[#1F1E1D] min-w-0">
                  <span className={`size-1.5 shrink-0 rounded-full ${dotClass}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="inline-flex items-center gap-2 shrink-0">
                  <span className="text-[#141413]">{item.actualText}</span>
                  <span className={`w-[58px] text-right ${achColor}`}>{achText}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export function InteractionTooltipCell({
  quality,
  playCount,
  rules,
}: {
  quality: WorkContentQuality | null | undefined;
  playCount: number | null;
  rules: ContentQualityRules | null | undefined;
}) {
  if (quality?.interactionAchievement == null) {
    return <span className="inline-block py-2.5 px-2.5 text-[12px] text-[#A8A29E]">—</span>;
  }

  const achPct = Math.round(quality.interactionAchievement);
  const hasDetail = Boolean(quality.interactionMetrics || quality.interactionValue != null);
  if (!hasDetail) {
    return <div className="py-2.5 px-2.5 text-[13px] text-[#141413] tabular-nums">{achPct}%</div>;
  }

  return (
    <SimpleTooltip
      align="end"
      contentClassName="w-[248px] max-w-[248px] flex-col items-stretch gap-2 p-3 text-left"
      tip={<InteractionBreakdownContent quality={quality} playCount={playCount} rules={rules} />}
    >
      <div className="flex h-full w-full items-center justify-end py-2.5 px-2.5 cursor-default group/cell">
        <span className="text-[13px] text-[#141413] tabular-nums border-b border-dashed border-[#D6D3D1] group-hover/cell:border-[#78716C] transition-colors">
          {achPct}%
        </span>
      </div>
    </SimpleTooltip>
  );
}

export function RetentionTooltipCell({
  quality,
  rules,
}: {
  quality: WorkContentQuality | null | undefined;
  rules: ContentQualityRules | null | undefined;
}) {
  if (quality?.contentAchievement == null) {
    return (
      <span className="inline-block py-2.5 px-2.5 text-[12px] text-[#A8A29E]">
        {getContentQualityStatusText(quality?.status ?? "pending_snapshot")}
      </span>
    );
  }

  const totalPct = Math.round(quality.contentAchievement);
  if (!quality.retentionMetrics) {
    return <div className="py-2.5 px-2.5 text-[13px] text-[#141413] tabular-nums">{totalPct}%</div>;
  }

  return (
    <SimpleTooltip
      align="end"
      contentClassName="w-[264px] max-w-[264px] flex-col items-stretch gap-2 p-3 text-left"
      tip={<RetentionBreakdownContent quality={quality} rules={rules} />}
    >
      <div className="flex h-full w-full items-center justify-end py-2.5 px-2.5 cursor-default group/cell">
        <span className="text-[13px] text-[#141413] tabular-nums border-b border-dashed border-[#D6D3D1] group-hover/cell:border-[#78716C] transition-colors">
          {totalPct}%
        </span>
      </div>
    </SimpleTooltip>
  );
}

export function OverallGradeTooltipCell({
  quality,
  playCount,
  rules,
}: {
  quality: WorkContentQuality | null | undefined;
  playCount: number | null;
  rules: ContentQualityRules | null | undefined;
}) {
  if (!quality?.overallGrade) {
    return (
      <div className="py-2.5 px-3">
        <span className="inline-block rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#A8A29E] border border-[#E2E2DF]">
          {getContentQualityStatusText(quality?.status ?? "pending_snapshot")}
        </span>
      </div>
    );
  }

  const effectivePlay = quality.snapshotPlayCount ?? playCount;
  const floors = rules?.playFloors;
  let playNote: string | null = null;
  let playDot = "bg-[#D6D3D1]";
  if (effectivePlay != null && floors) {
    if (effectivePlay < floors.floor) {
      playNote = `未满 ${formatBigNumber(floors.floor)} 直接判普`;
      playDot = "bg-status-danger";
    } else if (effectivePlay < floors.good) {
      playNote = `未满 ${formatBigNumber(floors.good)} 最高评普`;
      playDot = "bg-status-danger";
    } else if (effectivePlay < floors.excellent) {
      playNote = `未满 ${formatBigNumber(floors.excellent)} 最高评良`;
    } else {
      playNote = `已达 ${formatBigNumber(floors.excellent)} 门槛`;
      playDot = "bg-status-success";
    }
  }

  return (
    <SimpleTooltip
      align="end"
      contentClassName="w-[248px] max-w-[248px] flex-col items-stretch gap-2 p-3 text-left"
      tip={
        <>
          <div className="flex items-center justify-between border-b border-[#E2E2DF]/80 pb-1">
            <span className={`text-[12px] ${BREAKOUT_GRADE_TEXT_CLASS[quality.overallGrade]}`}>
              综合{quality.overallGrade}
            </span>
            {playNote ? <span className="text-[12px] text-[#78716C]">{playNote}</span> : null}
          </div>
          <div className="space-y-1 text-[12px] tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[#1F1E1D]">
                <span className={`size-1.5 shrink-0 rounded-full ${playDot}`} />
                <span>播放量</span>
              </span>
              <span className="text-[#141413]">{formatBigNumber(effectivePlay)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#78716C]">互动达成</span>
              <span className="text-[#141413]">
                {quality.interactionAchievement != null ? `${Math.round(quality.interactionAchievement)}%` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#78716C]">留存达成</span>
              <span className="text-[#141413]">
                {quality.contentAchievement != null ? `${Math.round(quality.contentAchievement)}%` : "—"}
              </span>
            </div>
          </div>
        </>
      }
    >
      <div className="flex h-full w-full items-center justify-end py-2.5 px-3 cursor-default group/cell">
        <span
          className={`inline-block font-normal border-b border-dashed border-[#D6D3D1] group-hover/cell:border-[#78716C] transition-colors ${BREAKOUT_GRADE_TEXT_CLASS[quality.overallGrade]}`}
        >
          综合{quality.overallGrade}
        </span>
      </div>
    </SimpleTooltip>
  );
}

/** 表格单元格全格悬停提示包装：避开原生 title 延迟，并让热区吃满单元格。 */
export function TableCellHint({
  tip,
  muted = false,
  className = "",
  children,
}: {
  tip: string;
  muted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SimpleTooltip tip={tip} align="end">
      <div
        className={`flex h-full w-full items-center justify-end px-2 py-2 cursor-help text-right ${muted ? "text-[#A8A29E]" : ""} ${className}`}
      >
        {children}
      </div>
    </SimpleTooltip>
  );
}
