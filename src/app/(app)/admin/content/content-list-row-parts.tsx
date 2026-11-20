import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { getContentOwner } from "@/lib/content/content-owner";
import { getStatusDot } from "@/lib/content/domain/content-list";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { cn } from "@/lib/utils";
import { formatCompactDate, formatFullDateTime, formatTimeOfDay } from "./content-list-cell-content";

/** 数据复盘桌面行与手机卡片共用的小部件：标题、负责人、状态、评级。 */

export function videoTitleOf(video: ProcessedContentRow["video"]): string {
  return video.video_title || video.content?.slice(0, 50) || "未命名视频";
}

export function videoAriaLabel(video: ProcessedContentRow["video"]): string {
  return `查看作品详情：${videoTitleOf(video)}${video.accounts?.name ? `（${video.accounts.name}）` : ""}`;
}

/** 只有需要留意的状态才出徽标（删稿 / 限流 / 异常 / 未满24h），正常作品不占位 */
export function StatusMark({ video }: { video: ProcessedContentRow["video"] }) {
  const dot = getStatusDot(video);
  if (dot.quiet) return null;
  return <Badge variant={dot.variant} className="shrink-0">{dot.label}</Badge>;
}

export function GradeMark({ grade }: { grade: "优" | "良" | "普" | null | undefined }) {
  if (!grade) return <span className="text-[#A8A29E]">—</span>;
  return <span className={BREAKOUT_GRADE_TEXT_CLASS[grade]}>{grade}</span>;
}

/** 负责人：点名字打开该作者的全部作品。只用 aria-label 说明去处，不再叠第二个浮层。 */
export function OwnerLink({
  video,
  ownerNames,
  onSelectAuthor,
  className,
}: {
  video: ProcessedContentRow["video"];
  ownerNames?: Record<string, string>;
  onSelectAuthor?: (authorId: string, authorName: string) => void;
  className?: string;
}) {
  const owner = getContentOwner(video, ownerNames);
  if (!owner.name) return null;
  if (!owner.id || !onSelectAuthor) {
    return <span className={cn("text-[#78716C]", className)}>{owner.name}</span>;
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelectAuthor(owner.id, owner.name);
      }}
      aria-label={`查看 ${owner.name} 的全部作品`}
      className={cn(
        "text-[#78716C] underline decoration-transparent underline-offset-2 hover:text-[#141413] hover:decoration-[#78716C]/60 transition-colors cursor-pointer",
        className,
      )}
    >
      {owner.name}
    </button>
  );
}

/** 标题按钮：悬停只出一个浮层（完整标题 + 账号）。标题是键盘进入作品的入口。 */
export function TitleButton({
  video,
  onOpen,
  className,
}: {
  video: ProcessedContentRow["video"];
  onOpen: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={(event) => {
              // 行本身也有 onClick：阻止冒泡，避免同一次点击触发两遍
              event.stopPropagation();
              onOpen();
            }}
            aria-label={videoAriaLabel(video)}
            className={cn(
              "min-w-0 text-left text-[14px] text-[#1F1E1D] group-hover:text-[#141413] transition-colors rounded-md outline-none focus-visible:underline focus-visible:decoration-[#141413] focus-visible:decoration-2 focus-visible:underline-offset-2 cursor-pointer",
              className,
            )}
          />
        }
      >
        {videoTitleOf(video)}
      </TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={4} className="max-w-md flex-col items-start text-left leading-relaxed">
        <div className="text-[#141413]">{video.video_title || video.content || "未命名视频"}</div>
        {video.accounts?.name ? <div className="text-[#78716C]">账号：@{video.accounts.name}</div> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * 作品格第二行：负责人 · 发布时间。时间不再单占一列，跟着作品走；账号按既定口径只在标题悬停与详情里看。
 * 单日只写时刻，多日写「月-日 时刻」。
 */
export function WorkMetaLine({
  video,
  isSingleDay,
  ownerNames,
  onSelectAuthor,
  className,
}: {
  video: ProcessedContentRow["video"];
  isSingleDay: boolean;
  ownerNames?: Record<string, string>;
  onSelectAuthor?: (authorId: string, authorName: string) => void;
  className?: string;
}) {
  const time = isSingleDay
    ? formatTimeOfDay(video.published_at)
    : `${formatCompactDate(video.published_at)} ${formatTimeOfDay(video.published_at)}`;
  return (
    <span className={cn("flex min-w-0 items-center gap-1 text-[12px] leading-[1.50] text-[#78716C]", className)}>
      <OwnerLink video={video} ownerNames={ownerNames} onSelectAuthor={onSelectAuthor} className="shrink-0" />
      <span className="shrink-0 tabular-nums" title={formatFullDateTime(video.published_at)}>· {time}</span>
    </span>
  );
}
