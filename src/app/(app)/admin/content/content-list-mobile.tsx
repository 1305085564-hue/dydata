import { EmptyState } from "@/components/ui/empty-state";
import { ROW_SELECTED } from "@/components/ui/selection";
import { cn } from "@/lib/utils";
import { isCellHighlighted, HIGHLIGHT_CELL_CLASS, type HighlightRuleMap } from "@/lib/content/domain/content-list-highlight";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { formatCount, formatPercent } from "./content-list-cell-content";
import { GradeMark, StatusMark, TitleButton, WorkMetaLine } from "./content-list-row-parts";

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
};

/**
 * 手机（<768px）：和协作管理岗位表同一种列表——每条作品一行，不横向拖动。
 * 左：评级字 + 标题，下一行 负责人 · 时间；
 * 右：播放量（定名墨），下一行 互动率 · 留存达成。其余指标点进作品诊断看。
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
}: ContentListMobileProps) {
  if (visibleRows.length === 0) {
    return (
      <div className="md:hidden py-8">
        <EmptyState variant="compact" title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }
  return (
    <ul className="md:hidden divide-y divide-[#E2E2DF]/60 border-y border-[#E2E2DF]/60">
      {visibleRows.map((item) => {
        const { video } = item;
        const isSelected = selectedVideoId === video.id;
        const playHit = isCellHighlighted(item, "playCount", highlightRules);
        const retention = item.quality?.contentAchievement;
        return (
          <li
            key={video.id}
            data-video-id={video.id}
            onClick={() => onSelectVideoId(video.id)}
            className={cn(
              "group flex cursor-pointer items-start gap-3 px-1 py-3 transition-colors",
              isSelected ? ROW_SELECTED : "active:bg-[#EBEBE9]",
            )}
          >
            <span className="w-4 shrink-0 text-[14px] leading-[1.50]">
              <GradeMark grade={item.quality?.overallGrade} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex min-w-0 items-center gap-2">
                <StatusMark video={video} />
                <TitleButton video={video} onOpen={() => onSelectVideoId(video.id)} className="truncate leading-[1.50]" />
              </span>
              <WorkMetaLine video={video} isSingleDay={isSingleDay} ownerNames={ownerNames} onSelectAuthor={onSelectAuthor} />
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1 tabular-nums">
              <span className={cn("text-[14px] leading-[1.50] text-[#141413]", playHit && HIGHLIGHT_CELL_CLASS)}>
                {formatCount(item.playCount)}
              </span>
              <span className="text-[12px] leading-[1.50] text-[#78716C]">
                互动 {formatPercent(item.interactionRate)} · 留存 {retention == null ? "—" : `${Math.round(retention)}%`}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
