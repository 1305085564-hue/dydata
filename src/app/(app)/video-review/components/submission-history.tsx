"use client";

import { useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { ImageLightbox } from "@/components/image-lightbox";
import { cn } from "@/lib/utils";

interface ScreenshotItem {
  path: string;
  signed_url: string | null;
}

export interface WorkSubmission {
  id: string;
  user_id: string;
  team_id: string | null;
  group_id: string | null;
  submit_date: string;
  content_text: string | null;
  screenshot_urls: string[] | null;
  screenshot_items?: ScreenshotItem[];
  note: string | null;
  created_at: string;
}

interface SubmissionHistoryProps {
  submissions: WorkSubmission[];
  onDelete: (id: string) => Promise<void>;
  onCtaClick?: () => void;
  readOnly?: boolean;
}

export function SubmissionHistory({
  submissions,
  onDelete,
  onCtaClick,
  readOnly = false,
}: SubmissionHistoryProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ paths: string[]; index: number } | null>(null);

  const handleDeleteClick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      await onDelete(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      // Auto-reset confirmation state after 3 seconds
      const timer = setTimeout(() => {
        setConfirmDeleteId((prev) => (prev === id ? null : prev));
      }, 3000);
      return () => clearTimeout(timer);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-[18px] font-medium text-stone-900">
          今日提交历史
        </h3>
        <span className="text-[12px] tabular-nums text-stone-500">
          共 {submissions.length} 条
        </span>
      </div>

      {submissions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white py-12 flex flex-col items-center justify-center text-center">
          <Upload className="size-10 text-stone-500 mb-3" />
          <p className="text-[13px] text-stone-500 mb-4">今天还没有提交发片凭证</p>
          {!readOnly && onCtaClick && (
            <button
              type="button"
              onClick={onCtaClick}
              className="h-9 px-4 rounded-lg bg-[#B4532F] text-[13px] font-medium text-white hover:bg-[#A84D2B] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/20"
            >
              立即上传凭证
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {submissions.map((sub) => {
            const screenshotUrls = (sub.screenshot_items ?? [])
              .map((img) => img.signed_url)
              .filter((url): url is string => Boolean(url));

            return (
              <div
                key={sub.id}
                onMouseLeave={() => {
                  if (confirmDeleteId === sub.id) {
                    setConfirmDeleteId(null);
                  }
                }}
                className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3 relative group"
              >
                {/* Click-to-confirm Delete Button */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteClick(e, sub.id)}
                    className={cn(
                      "absolute top-3 right-3 text-[12px] font-medium flex items-center gap-1 transition-all rounded px-2 py-0.5",
                      confirmDeleteId === sub.id
                        ? "text-[#B24E3E] bg-[#C9604D]/10 border border-[#C9604D]/20 opacity-100"
                        : "text-stone-500 hover:text-[#B24E3E] opacity-0 group-hover:opacity-100"
                    )}
                    title={confirmDeleteId === sub.id ? "确认删除？" : "删除"}
                  >
                    {confirmDeleteId === sub.id ? (
                      <span>确认删除？</span>
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                )}

                {/* Content text */}
                {sub.content_text && (
                  <p className="text-[13px] text-stone-700 leading-[1.6] line-clamp-3 whitespace-pre-wrap pr-6">
                    {sub.content_text}
                  </p>
                )}

                {/* Screenshots */}
                {screenshotUrls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {screenshotUrls.map((url, imgIdx) => (
                      <div
                        key={imgIdx}
                        onClick={() => setLightbox({ paths: screenshotUrls, index: imgIdx })}
                        className="size-11 relative rounded border border-stone-200 bg-stone-50 overflow-hidden cursor-zoom-in"
                      >
                        <img
                          src={url}
                          alt="截图"
                          className="size-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Note */}
                {sub.note && (
                  <div className="flex items-start gap-1 text-[12px] text-stone-500 truncate">
                    <FileText className="size-3 mt-0.5 shrink-0" />
                    <span>{sub.note}</span>
                  </div>
                )}

                {/* Sub time */}
                <div className="text-[12px] text-stone-500 ">
                  {new Date(sub.created_at).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox for zooming submissions screenshots */}
      {lightbox && (
        <ImageLightbox
          paths={lightbox.paths}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(idx) =>
            setLightbox((prev) => (prev ? { ...prev, index: idx } : prev))
          }
        />
      )}
    </div>
  );
}
