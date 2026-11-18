import { useEffect } from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { MonthReport } from "@/lib/video-submit/domain/types";
import { HistoryList } from "@/app/(app)/dashboard/history-list";
import { cn } from "@/lib/utils";
import { DashboardActivityError } from "./dashboard-activity-error";

type VideoSubmitPanelHistoryDialogProps = {
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
  accountDisplayNameMap: Record<string, string>;
  loadActivity: () => void | Promise<void>;
  activityError: string | null;
  isActivityLoading: boolean;
  isActivityLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  historyReports: MonthReport[];
  onRequestEdit: (target: { accountId: string; reportId: string; reportDate: string }) => void;
};

export function VideoSubmitPanelHistoryDialog({
  isHistoryOpen,
  setIsHistoryOpen,
  accountDisplayNameMap,
  loadActivity,
  activityError,
  isActivityLoading,
  isActivityLoadingMore,
  hasMore,
  onLoadMore,
  historyReports,
  onRequestEdit,
}: VideoSubmitPanelHistoryDialogProps) {
  useEffect(() => {
    if (!isHistoryOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsHistoryOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isHistoryOpen, setIsHistoryOpen]);

  return (
    <>
      {/* 历史记录列表弹窗 */}
      <Dialog
        open={isHistoryOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsHistoryOpen(false);
          } else {
            setIsHistoryOpen(true);
          }
        }}
      >
        <DialogContent
          className={cn(
            "fixed inset-0 m-auto flex flex-col overflow-hidden h-fit max-h-[85dvh] w-[calc(100%-2rem)] rounded-2xl bg-white shadow-claude-dialog p-0 !top-0 !left-0 !translate-x-0 !translate-y-0 transition-[max-width] duration-200",
            "sm:max-w-4xl md:max-w-[920px]",
          )}
        >
          <div className="flex flex-col flex-1 min-h-0 p-5 sm:p-6">
            <>
              <DialogHeader className="shrink-0 pb-3">
                  <DialogTitle>
                    历史记录
                  </DialogTitle>
                </DialogHeader>

                <DialogBody className="flex-1 min-h-0 overflow-y-auto">
                  {activityError ? (
                    <DashboardActivityError message={activityError} onRetry={() => void loadActivity()} />
                  ) : isActivityLoading ? (
                    <div className="flex h-40 items-center justify-center text-[14px] text-[#78716C]">
                      加载历史记录...
                    </div>
                  ) : !historyReports || historyReports.length === 0 ? (
                    <EmptyState
                      title="还没有交过作品"
                      description="每次交完或补交，都会记在这里。"
                    />
                  ) : (
                    <>
                      <HistoryList
                      history={historyReports.map((report) => ({
                        ...report,
                        content: report.content ?? null,
                        follower_convert: report.follower_convert ?? null,
                      }))}
                      accountDisplayNameMap={accountDisplayNameMap}
                      onReportOpen={(report) => {
                        if (!report.report_date) return;
                        setIsHistoryOpen(false);
                        onRequestEdit({ accountId: report.account_id, reportId: report.id, reportDate: report.report_date });
                      }}
                      />
                      {hasMore ? (
                      <div className="flex justify-center border-t border-[#E2E2DF]/60 pt-3">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isActivityLoadingMore}
                          onClick={onLoadMore}
                        >
                          {isActivityLoadingMore ? "正在加载…" : `加载更多（已加载 ${historyReports.length} 条）`}
                        </Button>
                      </div>
                      ) : null}
                    </>
                  )}
                </DialogBody>
            </>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
