"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  const [opening, setOpening] = useState(false);

  async function openReview() {
    if (opening) return;
    setOpening(true);
    try {
      const response = await fetch(
        `/api/admin/collaboration/work-video?reportId=${encodeURIComponent(reportId)}`,
      );
      const payload = await response.json().catch(() => ({})) as { videoId?: string; error?: string };
      if (!response.ok || !payload.videoId) {
        toast.error(payload.error || "暂时无法打开视频复盘");
        return;
      }
      router.push(`/admin/content?videoId=${encodeURIComponent(payload.videoId)}`, { scroll: false });
    } catch {
      toast.error("网络异常，暂时无法打开视频复盘");
    } finally {
      setOpening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openReview}
      disabled={opening}
      className={className}
      title="打开视频复盘，查看该作品的数据、截图和文案"
    >
      {children}
    </button>
  );
}
