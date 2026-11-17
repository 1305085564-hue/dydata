"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { VideoMetricsSnapshot, ContentReviewReadiness } from "@/types";
import type { VideoRow } from "@/lib/review-queue";
import type { VideoTopicKind } from "@/lib/topics/library";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CollaborationDiagnosisDetail = {
  video: VideoRow;
  snapshot: VideoMetricsSnapshot | null;
  reviewReadiness?: Record<string, ContentReviewReadiness> | null;
  /** 视频「话题」分类：干货看收藏率，复盘及其他看点赞率。 */
  topicKind?: VideoTopicKind | null;
  contentQuality?: WorkContentQuality | null;
};

export interface CollaborationDiagnosisContextValue {
  openDiagnosisByReportId: (reportId: string) => Promise<void>;
  openingReportId: string | null;
}

export const CollaborationDiagnosisContext =
  createContext<CollaborationDiagnosisContextValue | null>(null);

export interface WorkReviewPreviewInfo {
  title?: string;
  accountName?: string;
  playCount?: number | null;
  reportDate?: string;
  dataSource?: "ai" | "manual" | null;
}

interface CollaborationWorkReviewLinkProps {
  reportId: string;
  children: ReactNode;
  className?: string;
  preview?: WorkReviewPreviewInfo;
  /** "title-only" 用于同行已展示日期/账号/播放量的表格：仅标题被截断时显示全文，不重复抄同行字段。 */
  previewMode?: "full" | "title-only";
}

export function CollaborationWorkReviewLink({
  reportId,
  children,
  className,
  preview,
  previewMode = "full",
}: CollaborationWorkReviewLinkProps) {
  const router = useRouter();
  const diagnosisContext = useContext(CollaborationDiagnosisContext);
  const [localOpening, setLocalOpening] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isOpening = diagnosisContext
    ? diagnosisContext.openingReportId === reportId
    : localOpening;

  const showTitleOnly = previewMode === "title-only";

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && showTitleOnly) {
      const el = triggerRef.current;
      if (!el || el.scrollWidth <= el.clientWidth + 1) {
        setOpen(false);
        return;
      }
    }
    setOpen(nextOpen);
  };

  async function openReview() {
    if (isOpening) return;

    if (diagnosisContext) {
      await diagnosisContext.openDiagnosisByReportId(reportId);
      return;
    }

    setLocalOpening(true);
    try {
      const response = await fetch(
        `/api/admin/collaboration/work-video?reportId=${encodeURIComponent(reportId)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        videoId?: string;
        error?: string;
      };
      if (!response.ok || !payload.videoId) {
        toast.error(payload.error || "没能打开数据复盘");
        return;
      }
      router.push(`/admin/content?videoId=${encodeURIComponent(payload.videoId)}`, {
        scroll: false,
      });
    } catch {
      toast.error("刚才没能打开数据复盘，重试一下");
    } finally {
      setLocalOpening(false);
    }
  }

  const previewTitle = preview?.title || (typeof children === "string" ? children : "作品诊断");

  return (
    <Tooltip open={open} onOpenChange={handleOpenChange}>
      <TooltipTrigger
        ref={triggerRef}
        type="button"
        delay={140}
        onClick={(event) => {
          event.stopPropagation();
          void openReview();
        }}
        disabled={isOpening}
        className={className}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className={
          showTitleOnly
            ? "max-w-sm p-2 bg-white text-[#141413] border border-[#E2E2DF] shadow-claude-float rounded-xl text-left pointer-events-none"
            : "max-w-xs p-2.5 bg-white text-[#141413] border border-[#E2E2DF] shadow-claude-float rounded-2xl text-left space-y-1 pointer-events-none"
        }
      >
        {showTitleOnly ? (
          <p className="text-[12px] font-normal text-[#141413] leading-snug">
            {previewTitle}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-[12px] text-[#78716C] border-b border-[#E2E2DF]/60 pb-1">
              <span className="font-normal text-[#1F1E1D] truncate max-w-[140px]">
                {preview?.accountName || "协同作品"}
              </span>
              {preview?.reportDate && (
                <span className="tabular-nums text-[#78716C]">{preview.reportDate}</span>
              )}
            </div>
            <p className="text-[12px] font-normal text-[#141413] leading-snug line-clamp-2">
              {previewTitle}
            </p>
            <div className="flex items-center justify-between text-[12px] text-[#78716C] pt-0.5">
              {preview?.playCount != null ? (
                <span className="tabular-nums">
                  播放: <span className="font-normal text-[#141413]">{preview.playCount.toLocaleString("zh-CN")}</span>
                </span>
              ) : (
                <span>点击查看数据诊断</span>
              )}
              <span className="text-[#D97757] text-[12px] font-normal">展开手稿 ↗</span>
            </div>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
