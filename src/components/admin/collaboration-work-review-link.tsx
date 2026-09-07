"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { VideoMetricsSnapshot, ContentReviewReadiness } from "@/types";
import type { VideoRow } from "@/lib/review-queue";

export type CollaborationDiagnosisDetail = {
  video: VideoRow;
  snapshot: VideoMetricsSnapshot | null;
  reviewReadiness?: Record<string, ContentReviewReadiness> | null;
};

export interface CollaborationDiagnosisContextValue {
  openDiagnosisByReportId: (reportId: string) => Promise<void>;
  openingReportId: string | null;
}

export const CollaborationDiagnosisContext =
  createContext<CollaborationDiagnosisContextValue | null>(null);

interface CollaborationWorkReviewLinkProps {
  reportId: string;
  children: ReactNode;
  className?: string;
}

export function CollaborationWorkReviewLink({
  reportId,
  children,
  className,
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

  return (
    <button
      type="button"
      onClick={openReview}
      disabled={isOpening}
      className={className}
      title="打开视频诊断，查看该作品的数据看板、核心病因与文案"
    >
      {children}
    </button>
  );
}
