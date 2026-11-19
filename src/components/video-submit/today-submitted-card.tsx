import { useRef, useState } from "react";
import { Film } from "lucide-react";
import { motion } from "framer-motion";
import { ScreenshotInspector } from "@/components/submission/截图检视器";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ColophonMark } from "@/components/editorial/editorial-illustrations";
import { cn } from "@/lib/utils";
import { ROW_SELECTED } from "@/components/ui/selection";
import { getPublishedDateKey } from "@/lib/date-semantics";
import type { MonthReport } from "@/lib/video-submit/domain/types";

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString();
}

/**
 * 今天已交：页头已经说了「今天已交」，这里只说交了什么。
 * 下一步退成文字链接，不再有主按钮抢眼；落款寄语保留人文语气。
 */
export function TodaySubmittedCard({
  reports,
  selectedReportId,
  setSelectedReportId,
  onEdit,
  onCreateAnother,
  onGoToTopics,
}: {
  reports: MonthReport[];
  selectedReportId: string | null;
  setSelectedReportId: (reportId: string | null) => void;
  onEdit: () => void;
  onCreateAnother: () => void;
  onGoToTopics: () => void;
}) {
  const [inspecting, setInspecting] = useState<{ url: string; label: string } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-3">
      <Card className="divide-y divide-[#E2E2DF]/60 p-0">
        {reports.map((report, index) => {
          const title = report.title || "未命名作品";
          const assetUrl = report.screenshot_url ?? null;
          const isSelected = report.id === selectedReportId || reports.length === 1;
          return (
            <div
              key={report.id || `receipt-${index}`}
              className={cn("flex items-center gap-3 p-4", reports.length > 1 && isSelected && ROW_SELECTED)}
            >
              {assetUrl ? (
                <button
                  type="button"
                  onClick={(e) => {
                    triggerRef.current = e.currentTarget;
                    setInspecting({ url: assetUrl, label: `${title} · 截图核对` });
                  }}
                  className="relative size-11 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-[#E2E2DF] bg-[#F1F1F0]"
                  title="点击同屏核对截图原图"
                  aria-label={`同屏核对《${title}》截图原图`}
                >
                  <ScreenshotImage src={assetUrl} alt={title} variant="thumb" className="size-full object-cover" />
                </button>
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-[#E2E2DF] bg-[#F1F1F0]">
                  <Film className="size-4 text-[#78716C]" />
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-[14px] text-[#141413]">{title}</p>
                <p className="truncate text-[12px] tabular-nums text-[#78716C]">
                  {getPublishedDateKey(report) ?? report.report_date ?? "今天"} 发布 · 播放 {formatCount(report.play_count)} · 完播 {report.completion_rate ?? "—"} · 已写入日报
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="m"
                className="shrink-0"
                onClick={() => {
                  if (report.id) setSelectedReportId(report.id);
                  onEdit();
                }}
              >
                修改
              </Button>
            </div>
          );
        })}
      </Card>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 text-[14px]">
        <button type="button" onClick={onGoToTopics} className="text-[#1F1E1D] hover:text-[#141413] hover:underline cursor-pointer">
          去选题库挑明天的选题 →
        </button>
        <button type="button" onClick={onCreateAnother} className="text-[#78716C] hover:text-[#141413] hover:underline cursor-pointer">
          再交一条
        </button>
      </div>

      <div className="flex flex-col items-center justify-center gap-1 pt-2 pb-4 select-none">
        <ColophonMark className="py-0 gap-2" />
        <span className="text-[14px] text-[#78716C]">今日创作已立卷 · 数据已妥善入库</span>
      </div>

      {inspecting && (
        <ScreenshotInspector
          url={inspecting.url}
          label={inspecting.label}
          testId="receipt-inspector"
          onClose={() => setInspecting(null)}
          onReturnFocus={() => triggerRef.current?.focus()}
        />
      )}
    </motion.div>
  );
}
