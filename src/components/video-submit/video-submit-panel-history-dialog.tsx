import type { Dispatch, SetStateAction } from "react";

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
import { HistoryReportEditForm, type HistoryReportEditData } from "@/app/(app)/dashboard/history-report-edit-form";
import { cn } from "@/lib/utils";
import { getPublishedDateKey } from "@/lib/date-semantics";
import { DashboardActivityError } from "./dashboard-activity-error";

type VideoSubmitPanelHistoryDialogProps = {
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
  viewingReport: MonthReport | null;
  setViewingReport: Dispatch<SetStateAction<MonthReport | null>>;
  accountDisplayNameMap: Record<string, string>;
  loadActivity: () => void | Promise<void>;
  activityError: string | null;
  isActivityLoading: boolean;
  historyReports: MonthReport[];
};

export function VideoSubmitPanelHistoryDialog({
  isHistoryOpen,
  setIsHistoryOpen,
  viewingReport,
  setViewingReport,
  accountDisplayNameMap,
  loadActivity,
  activityError,
  isActivityLoading,
  historyReports,
}: VideoSubmitPanelHistoryDialogProps) {
  return (
    <>
      {/* 历史手稿纪事列表弹窗（内嵌右侧极速微调抽屉） */}
      <Dialog
        open={isHistoryOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (viewingReport) {
              setViewingReport(null);
            } else {
              setIsHistoryOpen(false);
            }
          } else {
            setIsHistoryOpen(true);
          }
        }}
      >
        <DialogContent
          className={cn(
            "fixed inset-0 m-auto flex flex-col overflow-hidden h-fit max-h-[85dvh] w-[calc(100%-2rem)] rounded-2xl bg-white shadow-claude-dialog p-0 !top-0 !left-0 !translate-x-0 !translate-y-0 transition-[max-width] duration-200",
            viewingReport
              ? "sm:max-w-2xl md:max-w-[680px]"
              : "sm:max-w-4xl md:max-w-[920px]",
          )}
        >
          <div className="flex flex-col flex-1 min-h-0 p-5 sm:p-6">
            {viewingReport ? (
              <>
                <DialogHeader className="shrink-0 pb-3 border-b border-[#E2E2DF]/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="s"
                        onClick={() => setViewingReport(null)}
                      >
                        ← 返回手稿列表
                      </Button>
                      <span className="text-[#E2E2DF]">|</span>
                      <DialogTitle>
                        修改历史手稿 · <span className="tabular-nums">发布日 {getPublishedDateKey(viewingReport) ?? "未知"}</span>
                      </DialogTitle>
                    </div>
                  </div>
                </DialogHeader>
                <DialogBody className="flex-1 min-h-0 overflow-y-auto pt-4">
                  <HistoryReportEditForm
                    key={`history-edit-${viewingReport.id}-${viewingReport.uploaded_at ?? viewingReport.report_date}`}
                    report={viewingReport as HistoryReportEditData}
                    accountDisplayName={accountDisplayNameMap[viewingReport.account_id] ?? viewingReport.account_id}
                    onSaved={() => {
                      setViewingReport(null);
                      void loadActivity();
                    }}
                  />
                </DialogBody>
              </>
            ) : (
              <>
                <DialogHeader className="shrink-0 pb-3">
                  <DialogTitle>
                    历史手稿纪事
                  </DialogTitle>
                </DialogHeader>

                <DialogBody className="flex-1 min-h-0 overflow-y-auto">
                  {activityError ? (
                    <DashboardActivityError message={activityError} onRetry={() => void loadActivity()} />
                  ) : isActivityLoading ? (
                    <div className="flex h-40 items-center justify-center text-[13px] text-[#78716C]">
                      加载历史记录...
                    </div>
                  ) : !historyReports || historyReports.length === 0 ? (
                    <EmptyState
                      title="历史手稿静待立卷"
                      description="完成创作立卷或补交后，这里将收录最近 30 份纪事手稿。"
                    />
                  ) : (
                    <HistoryList
                      history={historyReports.map((report) => ({
                        ...report,
                        content: report.content ?? null,
                        follower_convert: report.follower_convert ?? null,
                      }))}
                      accountDisplayNameMap={accountDisplayNameMap}
                      onReportOpen={(report) => {
                        if (!report.report_date) return;
                        setViewingReport({
                          ...report,
                          report_date: report.report_date,
                          content: report.content ?? null,
                          follower_convert: report.follower_convert ?? null,
                        });
                      }}
                    />
                  )}
                </DialogBody>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
