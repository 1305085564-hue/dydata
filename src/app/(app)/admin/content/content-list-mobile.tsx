import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { EvaluationStandards } from "@/lib/evaluation-standards";
import {
  HIGHLIGHT_CELL_CLASS,
  isCellHighlighted,
  type HighlightRuleMap,
} from "@/lib/content/domain/content-list-highlight";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import {
  Highlightable,
  RatioCell,
  formatCompactDate,
  formatCount,
  formatTimeOfDay,
} from "./content-list-cell-content";
import { GradeMark, OwnerLink, StatusMark, TitleButton } from "./content-list-row-parts";

type ContentListMobileProps = {
  visibleRows: ProcessedContentRow[];
  emptyTitle: string;
  emptyDescription: string;
  isSingleDay: boolean;
  selectedVideoId?: string | null;
  onSelectVideoId: (id: string | null) => void;
  ownerNames?: Record<string, string>;
  onSelectAuthor?: (authorId: string, authorName: string) => void;
  highlightRules: HighlightRuleMap;
  evaluationStandards: EvaluationStandards;
};

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="mb-1 text-[12px] leading-none text-[#78716C]">{label}</span>
      <span className="truncate text-[12px] tabular-nums text-[#1F1E1D]">{children}</span>
    </div>
  );
}

/**
 * 手机（<768px）：每条作品一张紧凑卡，不横向拖动。
 * 第 1 行：评级 + 需要留意的状态 + 标题；第 2 行：负责人 · 时间；
 * 第 3 行：和桌面表同序的五项——播放、互动率、留存达成、涨粉、完播。
 */
export function ContentListMobile({
  visibleRows,
  emptyTitle,
  emptyDescription,
  isSingleDay,
  selectedVideoId,
  onSelectVideoId,
  ownerNames,
  onSelectAuthor,
  highlightRules,
  evaluationStandards,
}: ContentListMobileProps) {
  return (
    <div className="md:hidden w-full overflow-hidden rounded-xl bg-white shadow-card-ring divide-y divide-[#E2E2DF]/60">
      {visibleRows.length === 0 ? (
        <div className="px-4 py-8">
          <EmptyState variant="compact" title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        visibleRows.map((item) => {
          const { video } = item;
          const isSelected = selectedVideoId === video.id;
          const hit = (key: Parameters<typeof isCellHighlighted>[1]) => isCellHighlighted(item, key, highlightRules);
          return (
            <div
              key={video.id}
              data-video-id={video.id}
              onClick={() => onSelectVideoId(video.id)}
              className={cn(
                "group flex cursor-pointer select-none flex-col gap-2 p-3 transition-colors",
                isSelected ? "bg-[#F1F1F0]" : "active:bg-[#EBEBE9]",
              )}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="w-4 shrink-0 pt-[3px] text-[14px] leading-snug">
                  <GradeMark grade={item.quality?.overallGrade} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 items-start gap-2">
                    <StatusMark video={video} />
                    <TitleButton
                      video={video}
                      onOpen={() => onSelectVideoId(video.id)}
                      className="line-clamp-2 min-h-[44px] flex-1 py-0.5 leading-snug"
                    />
                  </div>
                  <div className="flex min-w-0 items-center gap-1 text-[12px] text-[#78716C]">
                    <OwnerLink video={video} ownerNames={ownerNames} onSelectAuthor={onSelectAuthor} className="min-h-[24px] truncate" />
                    <span className="shrink-0 tabular-nums">
                      · {isSingleDay ? formatTimeOfDay(video.published_at) : formatCompactDate(video.published_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1 pl-6 text-left">
                <Metric label="播放">
                  <span className="text-[#141413]"><Highlightable hit={hit("playCount")}>{formatCount(item.playCount)}</Highlightable></span>
                </Metric>
                <Metric label="互动率">
                  <RatioCell standards={evaluationStandards} value={item.interactionRate} achievement={item.quality?.interactionAchievement} lowSample={item.lowSample} className={cn(hit("interactionRate") && HIGHLIGHT_CELL_CLASS)} />
                </Metric>
                <Metric label="留存达成">
                  {item.quality?.contentAchievement == null ? "—" : `${Math.round(item.quality.contentAchievement)}%`}
                </Metric>
                <Metric label="涨粉">
                  <Highlightable hit={hit("followerGain")}>{formatCount(item.followerGain)}</Highlightable>
                </Metric>
                <Metric label="完播">
                  <RatioCell standards={evaluationStandards} value={item.completionRate} lowSample={item.lowSample} metricType="completion_rate" className={cn(hit("completionRate") && HIGHLIGHT_CELL_CLASS)} />
                </Metric>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
