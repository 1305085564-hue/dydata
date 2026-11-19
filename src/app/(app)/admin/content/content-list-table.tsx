import React from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";
import type { SortField } from "@/lib/content/domain/content-list";
import {
  HIGHLIGHT_CELL_CLASS,
  isCellHighlighted,
  type HighlightFieldKey,
  type HighlightRuleMap,
} from "@/lib/content/domain/content-list-highlight";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import {
  DurationCell,
  Highlightable,
  InteractionRateTooltipCell,
  RatioCell,
  RetentionAchievementTooltipCell,
  formatCompactDate,
  formatCount,
  formatFullDateTime,
  formatTimeOfDay,
} from "./content-list-cell-content";
import { ContentListTableHeader } from "./content-list-table-header";
import { SORTED_COL_BG, visibleContentColumns, type ContentColumn } from "./content-list-columns";
import { ContentListMobile } from "./content-list-mobile";
import { GradeMark, OwnerLink, StatusMark, TitleButton } from "./content-list-row-parts";

type ContentListTableProps = {
  metricViewMode: "full" | "spacious";
  visibleRows: ProcessedContentRow[];
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  emptyTitle: string;
  emptyDescription: string;
  sortField: SortField;
  sortDir: "asc" | "desc";
  handleSort: (field: SortField) => void;
  isSingleDay: boolean;
  selectedVideoId?: string | null;
  onSelectVideoId: (id: string | null) => void;
  ownerNames?: Record<string, string>;
  onSelectAuthor?: (authorId: string, authorName: string) => void;
  highlightRules: HighlightRuleMap;
  evaluationStandards?: EvaluationStandards;
};

type CellContext = {
  item: ProcessedContentRow;
  isSingleDay: boolean;
  isSelected: boolean;
  standards: EvaluationStandards;
  hit: (key: HighlightFieldKey) => boolean;
  ownerNames?: Record<string, string>;
  onSelectAuthor?: (authorId: string, authorName: string) => void;
  onOpen: () => void;
};

/** 数字列：右对齐、等宽数字；辅助列说明墨，核心列在列定义里单独提墨。 */
const NUMBER_TD = "py-2.5 text-right tabular-nums whitespace-nowrap";

function padOf(column: ContentColumn) {
  return column.groupStart ? "pl-4 pr-2" : "px-2";
}

function renderCell(column: ContentColumn, ctx: CellContext): { className: string; content: React.ReactNode } {
  const { item, standards, hit } = ctx;
  const pad = padOf(column);
  switch (column.key) {
    case "title":
      return {
        className: cn(
          "sticky left-0 z-20 py-2.5 px-3 shadow-[1px_0_0_0_#E2E2DF] transition-colors",
          ctx.isSelected
            ? "bg-[#F1F1F0] group-hover:bg-[#EBEBE9]"
            : "bg-white group-hover:bg-[#F7F7F6] group-active:bg-[#EBEBE9] group-has-[button:focus-visible]:bg-[#F7F7F6]",
        ),
        content: (
          <div className="flex min-w-0 items-center gap-2">
            <StatusMark video={item.video} />
            <TitleButton video={item.video} onOpen={ctx.onOpen} className="truncate" />
            <OwnerLink
              video={item.video}
              ownerNames={ctx.ownerNames}
              onSelectAuthor={ctx.onSelectAuthor}
              className="shrink-0 max-w-[96px] truncate text-[12px]"
            />
          </div>
        ),
      };
    case "overall_grade":
      return { className: cn("py-2.5 text-left text-[14px]", pad), content: <GradeMark grade={item.quality?.overallGrade} /> };
    case "play_count":
      return {
        className: cn(NUMBER_TD, pad, "text-[14px] text-[#141413]"),
        content: <Highlightable hit={hit("playCount")}>{formatCount(item.playCount)}</Highlightable>,
      };
    case "interaction_rate":
      return {
        className: "p-0 text-right tabular-nums whitespace-nowrap text-[#1F1E1D]",
        content: (
          <InteractionRateTooltipCell
            value={item.interactionRate}
            quality={item.quality}
            playCount={item.playCount}
            lowSample={item.lowSample}
            standards={standards}
            highlightClass={hit("interactionRate") ? HIGHLIGHT_CELL_CLASS : ""}
          />
        ),
      };
    case "retention_achievement":
      return {
        className: "p-0 text-right tabular-nums whitespace-nowrap text-[#1F1E1D]",
        content: <RetentionAchievementTooltipCell quality={item.quality} standards={standards} />,
      };
    case "follower_gain":
      return {
        className: cn(NUMBER_TD, pad, "text-[#1F1E1D]"),
        content: <Highlightable hit={hit("followerGain")}>{formatCount(item.followerGain)}</Highlightable>,
      };
    case "likes":
    case "comments":
    case "shares":
    case "favorites": {
      const field = column.key;
      return {
        className: cn(NUMBER_TD, pad, "text-[#78716C]"),
        content: <Highlightable hit={hit(field)}>{formatCount(item[field])}</Highlightable>,
      };
    }
    case "bounce_rate_2s":
      return {
        className: "p-0 text-right tabular-nums whitespace-nowrap text-[#78716C]",
        content: <RatioCell fullCell cellClassName={pad} standards={standards} value={item.bounceRate2s} lowSample={item.lowSample} metricType="bounce_rate_2s" className={hit("bounceRate2s") ? HIGHLIGHT_CELL_CLASS : ""} />,
      };
    case "completion_rate_5s":
      return {
        className: "p-0 text-right tabular-nums whitespace-nowrap text-[#78716C]",
        content: <RatioCell fullCell cellClassName={pad} standards={standards} value={item.completionRate5s} lowSample={item.lowSample} metricType="completion_rate_5s" className={hit("completionRate5s") ? HIGHLIGHT_CELL_CLASS : ""} />,
      };
    case "avg_play_duration":
      return {
        className: "p-0 text-right tabular-nums whitespace-nowrap text-[#78716C]",
        content: <DurationCell fullCell cellClassName={pad} standards={standards} value={item.avgPlayDuration} lowSample={item.lowSample} className={hit("avgPlayDuration") ? HIGHLIGHT_CELL_CLASS : ""} />,
      };
    case "avg_play_ratio":
      return {
        className: "p-0 text-right tabular-nums whitespace-nowrap text-[#78716C]",
        content: <RatioCell fullCell cellClassName={pad} standards={standards} value={item.avgPlayRatio} lowSample={item.lowSample} metricType="avg_play_ratio" />,
      };
    case "completion_rate":
      return {
        className: "p-0 text-right tabular-nums whitespace-nowrap text-[#78716C]",
        content: <RatioCell fullCell cellClassName={pad} standards={standards} value={item.completionRate} lowSample={item.lowSample} metricType="completion_rate" className={hit("completionRate") ? HIGHLIGHT_CELL_CLASS : ""} />,
      };
    case "published_at":
      return {
        className: "p-0 text-right tabular-nums whitespace-nowrap text-[12px] text-[#1F1E1D]",
        content: (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className={cn("flex h-full w-full items-center justify-end py-2.5", pad)}>
                  {ctx.isSingleDay ? formatTimeOfDay(item.video.published_at) : formatCompactDate(item.video.published_at)}
                </div>
              }
            />
            <TooltipContent side="top" align="end">{formatFullDateTime(item.video.published_at)}</TooltipContent>
          </Tooltip>
        ),
      };
  }
}

export function ContentListTable({
  metricViewMode,
  visibleRows,
  tableContainerRef,
  emptyTitle,
  emptyDescription,
  sortField,
  sortDir,
  handleSort,
  isSingleDay,
  selectedVideoId,
  onSelectVideoId,
  onSelectAuthor,
  ownerNames,
  highlightRules,
  evaluationStandards = DEFAULT_EVALUATION_STANDARDS,
}: ContentListTableProps) {
  const columns = visibleContentColumns(metricViewMode === "spacious");

  // 打开的作品不在视口内时滚到中间。手机卡片和桌面行各有一份 DOM，
  // 只挑真正有渲染盒子（getClientRects 非空）的那一份。
  React.useEffect(() => {
    if (!selectedVideoId || !tableContainerRef?.current) return;
    const candidates = tableContainerRef.current.querySelectorAll<HTMLElement>(
      `[data-video-id="${CSS.escape(selectedVideoId)}"]`,
    );
    const rowEl = Array.from(candidates).find((el) => el.getClientRects().length > 0);
    if (!rowEl) return;
    const rect = rowEl.getBoundingClientRect();
    // 顶部留出 96px（吸顶工具栏与表头）
    if (rect.top < 96 || rect.bottom > window.innerHeight) {
      rowEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selectedVideoId, tableContainerRef]);

  return (
    <div ref={tableContainerRef} className="flex-1 w-full min-h-0">
      <ContentListMobile
        visibleRows={visibleRows}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        isSingleDay={isSingleDay}
        selectedVideoId={selectedVideoId}
        onSelectVideoId={onSelectVideoId}
        onSelectAuthor={onSelectAuthor}
        ownerNames={ownerNames}
        highlightRules={highlightRules}
        evaluationStandards={evaluationStandards}
      />

      {/* 桌面与平板（≥768px）：列由 CONTENT_COLUMNS 统一生成，窄屏横向滚动时冻结作品列 */}
      <Card className="hidden md:block flex-1 w-full p-0 gap-0">
        <Table className="text-left border-collapse table-fixed min-w-[960px] lg:min-w-[1160px] xl:min-w-full">
          <colgroup>
            {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
          </colgroup>
          <ContentListTableHeader
            columns={columns}
            sortField={sortField}
            sortDir={sortDir}
            handleSort={handleSort}
            evaluationStandards={evaluationStandards}
          />
          <tbody className="divide-y divide-[#E2E2DF]/60 text-[13px] text-[#1F1E1D]">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-[#1F1E1D]">
                  <EmptyState variant="compact" title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              visibleRows.map((item) => {
                const isSelected = selectedVideoId === item.video.id;
                const ctx: CellContext = {
                  item,
                  isSingleDay,
                  isSelected,
                  standards: evaluationStandards,
                  hit: (key) => isCellHighlighted(item, key, highlightRules),
                  ownerNames,
                  onSelectAuthor,
                  onOpen: () => onSelectVideoId(item.video.id),
                };
                return (
                  <tr
                    key={item.video.id}
                    data-video-id={item.video.id}
                    aria-selected={isSelected || undefined}
                    onClick={() => onSelectVideoId(item.video.id)}
                    className={cn(
                      "group transition-colors duration-150 cursor-pointer has-[button:focus-visible]:bg-[#F7F7F6]",
                      isSelected ? "bg-[#F1F1F0] hover:bg-[#EBEBE9]" : "hover:bg-[#F7F7F6] active:bg-[#EBEBE9]",
                    )}
                  >
                    {columns.map((column) => {
                      const cell = renderCell(column, ctx);
                      const isSorted = column.sortField !== undefined && column.sortField === sortField;
                      return (
                        <td
                          key={column.key}
                          data-col-key={column.key}
                          className={cn(cell.className, isSorted && column.key !== "title" && SORTED_COL_BG)}
                        >
                          {cell.content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
