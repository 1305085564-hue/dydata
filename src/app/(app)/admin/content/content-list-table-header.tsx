import type { ReactElement } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEFAULT_EVALUATION_STANDARDS,
  EVALUATION_METRICS,
  type EvaluationMetric,
  type EvaluationStandards,
} from "@/lib/evaluation-standards";
import { KPI_PLAY_EXCELLENT, KPI_PLAY_FLOOR, KPI_PLAY_GOOD } from "@/lib/breakout-rating";
import type { SortField } from "@/lib/content/domain/content-list";
import {
  SORTED_COL_BG,
  SORTED_STICKY_COL_BG,
  contentColumnPadClass,
  type ContentColumn,
  type ContentColumnTip,
} from "./content-list-columns";

type ContentListTableHeaderProps = {
  columns: ContentColumn[];
  sortField: SortField;
  sortDir: "asc" | "desc";
  handleSort: (field: SortField) => void;
  evaluationStandards?: EvaluationStandards;
};

function standardLine(metric: EvaluationMetric, standards: EvaluationStandards): string {
  const meta = EVALUATION_METRICS.find((item) => item.key === metric)!;
  const band = standards[metric];
  const goodOp = meta.lowerIsBetter ? "≤" : "≥";
  const poorOp = meta.lowerIsBetter ? ">" : metric === "avgPlayRatio" ? "<" : "≤";
  return `${meta.label}：好 ${goodOp}${band.good}${meta.unit} · 差 ${poorOp}${band.poor}${meta.unit}（低于 ${standards.minPlayCount.toLocaleString("zh-CN")} 播放计样本不足）`;
}

export function columnTipText(tip: ContentColumnTip, standards: EvaluationStandards): string {
  switch (tip.kind) {
    case "standard":
      return standardLine(tip.metric, standards);
    case "interaction":
      return `（点赞+评论+分享+收藏）÷ 播放量；参考基准 ${standards.targets.interactionRate}%（达成率好 ≥${standards.interactionAchievement.good}% · 差 ≤${standards.interactionAchievement.poor}%）`;
    case "retention":
      return "按 2s 跳出 / 5s 完播 / 均播与播放占比 / 整体完播权重加权计算达成率；缺项时按均播或占比折算";
    case "grade":
      return `互动与留存达成均 ≥100% 且均 ≥80% 评优；≥80% 且均 ≥60% 评良；低于 ${KPI_PLAY_FLOOR.toLocaleString("zh-CN")} 播放直接评普，低于 ${KPI_PLAY_GOOD.toLocaleString("zh-CN")} 最高普，低于 ${KPI_PLAY_EXCELLENT.toLocaleString("zh-CN")} 最高良`;
  }
}

/**
 * 表头只从列定义生成。层级：12px 说明墨；当前排序列定名墨 + 整列浅底；
 * 带虚线下划的列头悬停可看口径（标准线 / 计算方式）。
 */
export function ContentListTableHeader({
  columns,
  sortField,
  sortDir,
  handleSort,
  evaluationStandards = DEFAULT_EVALUATION_STANDARDS,
}: ContentListTableHeaderProps) {
  return (
    <thead className="sticky top-0 z-30 bg-[#FCFCFB]/85 backdrop-blur-md border-b border-[#E2E2DF]/60 text-[12px] text-[#78716C] select-none">
      <tr>
        {columns.map((column, index) => {
          const isTitle = column.key === "title";
          const isLast = index === columns.length - 1;
          const isSorted = column.sortField !== undefined && column.sortField === sortField;
          const ariaSort = column.sortField
            ? isSorted ? (sortDir === "desc" ? "descending" : "ascending") : "none"
            : undefined;
          const label = column.sortLabel ? (
            <span>{column.label}<span className="text-[#A8A29E]"> · 按{column.sortLabel}</span></span>
          ) : column.tip ? (
            <span className="border-b border-dashed border-[#D6D3D1] group-hover:border-[#78716C] transition-colors">
              {column.label}
            </span>
          ) : (
            <span>{column.label}</span>
          );
          const indicator = column.sortField ? (
            isSorted ? (
              sortDir === "desc" ? <ArrowDown className="size-3 text-[#141413]" aria-hidden /> : <ArrowUp className="size-3 text-[#141413]" aria-hidden />
            ) : (
              <ArrowDown className="size-3 text-[#A8A29E] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
            )
          ) : null;
          const sortName = column.sortLabel ?? column.label;
          const button = column.sortField ? (
            <button
              type="button"
              aria-label={`按${sortName}排序${isSorted ? (sortDir === "desc" ? "（当前降序，点击改升序）" : "（当前升序，点击改降序）") : ""}`}
              onClick={() => handleSort(column.sortField!)}
              className={cn(
                "group inline-flex w-full items-center gap-1 transition-colors cursor-pointer",
                column.align === "right" ? "justify-end" : "justify-start",
                isSorted ? "text-[#141413]" : "text-[#78716C] hover:text-[#141413]",
              )}
            >
              {column.align === "right" ? <>{indicator}{label}</> : <>{label}{indicator}</>}
            </button>
          ) : label;

          return (
            <th
              key={column.key}
              data-col-key={column.key}
              aria-sort={ariaSort}
              style={isTitle ? undefined : { width: column.width }}
              className={cn(
                "py-2 font-normal whitespace-nowrap",
                column.align === "right" ? "text-right" : "text-left",
                contentColumnPadClass(column, isLast),
                isTitle && "sticky left-0 z-30 bg-[#FCFCFB] shadow-[1px_0_0_0_#E2E2DF]",
                isSorted && (isTitle ? SORTED_STICKY_COL_BG : SORTED_COL_BG),
              )}
            >
              {column.tip ? (
                <Tooltip>
                  <TooltipTrigger render={button as ReactElement} />
                  <TooltipContent side="top" align="end" className="max-w-xs text-left leading-relaxed">
                    {columnTipText(column.tip, evaluationStandards)}
                  </TooltipContent>
                </Tooltip>
              ) : button}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
