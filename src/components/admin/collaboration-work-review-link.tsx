"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { VideoMetricsSnapshot, ContentReviewReadiness } from "@/types";
import type { VideoRow } from "@/lib/review-queue";
import type { VideoTopicKind } from "@/lib/topics/library";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CollaborationDiagnosisDetail = {
  video: VideoRow;
  snapshot: VideoMetricsSnapshot | null;
  reviewReadiness?: Record<string, ContentReviewReadiness> | null;
  /** 视频「话题」分类：干货看收藏率，复盘及其他看点赞率。 */
  topicKind?: VideoTopicKind | null;
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
}

export function CollaborationWorkReviewLink({
  reportId,
  children,
  className,
  preview,
}: CollaborationWorkReviewLinkProps) {
  const router = useRouter();
  const diagnosisContext = useContext(CollaborationDiagnosisContext);
  const [localOpening, setLocalOpening] = useState(false);

  const isOpening = diagnosisContext
    ? diagnosisContext.openingReportId === reportId
    : localOpening;

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
        toast.error(payload.error || "暂时无法打开视频复盘");
        return;
      }
      router.push(`/admin/content?videoId=${encodeURIComponent(payload.videoId)}`, {
        scroll: false,
      });
    } catch {
      toast.error("网络异常，暂时无法打开视频复盘");
    } finally {
      setLocalOpening(false);
    }
  }

  const previewTitle = preview?.title || (typeof children === "string" ? children : "作品诊断");

  return (
    <TooltipProvider delay={250}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          onClick={openReview}
          disabled={isOpening}
          className={className}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-xs p-2.5 bg-white text-[#1C1917] border border-[#E2E2DF] shadow-claude-float rounded-xl text-left space-y-1.5 pointer-events-none z-50"
        >
          <div className="flex items-center justify-between text-[12px] text-[#78716C] border-b border-[#E2E2DF]/60 pb-1">
            <span className="font-medium text-[#292524] truncate max-w-[140px]">
              {preview?.accountName || "协同作品"}
            </span>
            {preview?.reportDate && (
              <span className="tabular-nums text-[#78716C]">{preview.reportDate}</span>
            )}
          </div>
          <p className="text-[12px] font-medium text-[#1C1917] leading-snug line-clamp-2">
            {previewTitle}
          </p>
          <div className="flex items-center justify-between text-[12px] text-[#78716C] pt-0.5">
            {preview?.playCount != null ? (
              <span className="tabular-nums">
                播放: <span className="font-medium text-[#1C1917]">{preview.playCount.toLocaleString("zh-CN")}</span>
              </span>
            ) : (
              <span>点击查看数据诊断</span>
            )}
            <span className="text-[#D97757] text-[10px] font-medium">展开手稿 ↗</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
