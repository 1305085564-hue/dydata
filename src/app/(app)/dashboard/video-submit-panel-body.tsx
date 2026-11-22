import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardActivityError } from "@/components/video-submit/dashboard-activity-error";
import { TodaySubmittedCard } from "@/components/video-submit/today-submitted-card";
import { VideoSubmitFormV2 } from "@/app/(app)/dashboard/video-submit-form-v2";
import { WorkbenchNoticeBar, buildExemptionReviewNoticeItems, buildPendingExemptionNoticeItem } from "@/components/video-submit/workbench-notice-bar";
import { getPublishedDateKey } from "@/lib/business-time";
import { clearBrowserAppealSuccessSession } from "@/lib/video-submit/domain/appeal-success-session";

import type { VideoSubmitPanelBodyProps } from "./video-submit-panel-body.types";

export function VideoSubmitPanelBody({
  formAnchorRef,
  shouldShowForm,
  isExemptionPending,
  pendingExemptionItems,
  lastSubmissionPreferences,
  dismissedPendingExemption,
  userExemptionReviewNotices,
  dismissedReviewNotice,
  handleDismissReviewNotice,
  dismissPendingExemption,
  onWithdrawPendingExemption,
  isPrimarySummaryMode,
  activeBizDate,
  today,
  submittedViewActive,
  setSubmittedViewActive,
  primarySummary,
  handleGoToTopics,
  activeDateStatus,
  shouldShowActivityErrorCard,
  loadActivity,
  shouldShowActivityLoadingCard,
  shouldShowHistoricalSubmittedCard,
  activeDateReport,
  requestedEditBizDate,
  onRequestEditSubmittedReport,
  onCreateAnother,
  clearSubmittedEditTarget,
  activeDateReports,
  selectedReportId,
  setSelectedReportId,
  setRequestedMode,
  shouldShowEditDetailLoading,
  shouldShowEditDetailError,
  editDetailLoadState,
  setEditDetailRequestVersion,
  onActiveBizDateChange,
  selectedAccount,
  userId,
  userDisplayName,
  primaryMode,
  initialTopicId,
  initialTopicTitle,
  handleSubmitted,
  onViewHistory,
  onViewVideo,
  onFormProgressChange,
}: VideoSubmitPanelBodyProps) {
  const editDetailMissing = Boolean(editDetailLoadState.error?.includes("没有可编辑"));
  const backToToday = () => {
    clearSubmittedEditTarget();
    setRequestedMode(null);
    if (activeBizDate !== today) onActiveBizDateChange?.(today);
  };

  return (
    <>
        <div className="space-y-5" ref={formAnchorRef}>
            {/* 待审批豁免与审批结果提示区 (仅在表单未挂载时在此展示；表单挂载时由表单内的 WorkbenchNoticeCapsule 统一内联) */}
            {!shouldShowForm &&
              ((isExemptionPending && !dismissedPendingExemption) ||
                (userExemptionReviewNotices.length > 0 && !dismissedReviewNotice)) && (
                <WorkbenchNoticeBar
                  notices={[
                    // 审批中排第一：折叠时也能直接看到、直接撤回
                    ...(isExemptionPending && !dismissedPendingExemption
                      ? [buildPendingExemptionNoticeItem({ items: pendingExemptionItems, onDismiss: dismissPendingExemption, onWithdraw: onWithdrawPendingExemption })]
                      : []),
                    ...(userExemptionReviewNotices.length > 0 && !dismissedReviewNotice
                      ? buildExemptionReviewNoticeItems(userExemptionReviewNotices, handleDismissReviewNotice)
                      : []),
                  ]}
                />
              )}

            {/* 今天已交：页头说「今天已交」，这里只说交了什么 */}
            {isPrimarySummaryMode && activeBizDate === today && !submittedViewActive ? (
              <TodaySubmittedCard
                reports={activeDateReports.length > 0 ? activeDateReports : activeDateReport ? [activeDateReport] : []}
                selectedReportId={selectedReportId}
                setSelectedReportId={setSelectedReportId}
                onEdit={() => setRequestedMode("editToday")}
                onCreateAnother={() => setRequestedMode("createAnother")}
                onGoToTopics={handleGoToTopics}
              />
            ) : null}

            {shouldShowActivityErrorCard ? (
              <div className="py-5">
                <DashboardActivityError
                  message={activeDateStatus.errorMessage ?? "交过的记录没加载出来，点重试后再补交。"}
                  onRetry={() => void loadActivity()}
                />
              </div>
            ) : null}

            {/* 等待态：中性灰点，不用警示色；只说在查什么、查完能干什么 */}
            {shouldShowActivityLoadingCard ? (
              <div className="flex items-center gap-2 px-2 text-[14px] text-[#78716C]">
                <span className="size-1.5 shrink-0 rounded-full bg-[#A8A29E] motion-safe:animate-pulse" aria-hidden />
                正在查这天交过没有，查完就能补交
              </div>
            ) : null}

            {/* 过去某天已交：页头已经说了状态，这里只列交了什么，每条一个「修改」 */}
            {shouldShowHistoricalSubmittedCard && activeDateReport ? (
              <div className="max-w-3xl space-y-3">
                <Card className="divide-y divide-[#E2E2DF]/60 p-0">
                  {(activeDateReports.length > 0 ? activeDateReports : [activeDateReport]).map((report) => (
                    <div key={report.id} className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-[14px] text-[#141413]">{report.title || "未填标题"}</p>
                        <p className="truncate text-[12px] tabular-nums text-[#78716C]">
                          {getPublishedDateKey(report) ?? report.report_date} 发布
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="m"
                        className="shrink-0"
                        onClick={() => {
                          setSelectedReportId(report.id);
                          setRequestedMode("editToday");
                        }}
                      >
                        修改
                      </Button>
                    </div>
                  ))}
                </Card>
                <div className="px-2 text-[14px]">
                  <button
                    type="button"
                    onClick={() => setRequestedMode("createAnother")}
                    className="cursor-pointer text-[#78716C] hover:text-[#141413] hover:underline"
                  >
                    这天再交一条
                  </button>
                </div>
              </div>
            ) : null}

            {/* 固定高度的等待位，和下面表单首块等高，打开时不跳 */}
            {shouldShowEditDetailLoading ? (
              <div className="flex h-[136px] items-center gap-2 px-2 text-[14px] text-[#78716C]">
                <span className="size-1.5 shrink-0 rounded-full bg-[#A8A29E] motion-safe:animate-pulse" aria-hidden />
                正在打开这条作品，读取原来的截图、数据和署名
              </div>
            ) : null}

            {shouldShowEditDetailError ? (
              <div className="py-5">
                <EmptyState
                  title={editDetailMissing ? "这天没有能修改的作品" : "这条作品没打开"}
                  description={
                    editDetailMissing
                      ? "这一天没有交过作品。可以回到今天，或在月历里换一天。"
                      : (editDetailLoadState.error || "原来的记录没读到，点「重新打开」再试一次。")
                  }
                  action={
                    editDetailMissing
                      ? { label: "回到今天", onClick: backToToday }
                      : { label: "重新打开", onClick: () => setEditDetailRequestVersion((v) => v + 1) }
                  }
                />
                {!editDetailMissing && (
                  <div className="mt-2 flex justify-center">
                    <Button type="button" variant="ghost" size="m" onClick={backToToday}>
                      回到今天
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {/* 表单区域 */}
            {shouldShowForm && selectedAccount ? (
              <VideoSubmitFormV2
                key={`form-${selectedAccount.id}-${activeBizDate}-${initialTopicId ?? "no-topic"}`}
                account={selectedAccount}
                userId={userId}
                userDisplayName={userDisplayName}
                today={today}
                mode={primaryMode}
                initialSummary={
                  submittedViewActive || primaryMode === "backfill" || primaryMode === "create"
                    ? null
                    : primarySummary
                }
                editDetail={editDetailLoadState.status === "ready" ? editDetailLoadState.detail : null}
                initialBizDate={requestedEditBizDate ?? activeDateReport?.report_date ?? activeBizDate}
                initialTopicId={initialTopicId}
                initialTopicTitle={initialTopicTitle}
                submittedViewActive={submittedViewActive}
                userExemptionReviewNotices={userExemptionReviewNotices}
                isExemptionPending={isExemptionPending && !dismissedPendingExemption}
                pendingExemptionItems={pendingExemptionItems}
                lastSubmissionPreferences={lastSubmissionPreferences}
                onDismissPendingExemption={dismissPendingExemption}
                onWithdrawPendingExemption={onWithdrawPendingExemption}
                onSubmitted={handleSubmitted}
                onViewHistory={onViewHistory}
                onViewVideo={onViewVideo}
                onProgressChange={onFormProgressChange}
                onCancel={() => {
                  clearBrowserAppealSuccessSession(selectedAccount.id, today);
                  clearSubmittedEditTarget();
                  setSubmittedViewActive(false);
                  setRequestedMode(null);
                  if (activeBizDate !== today) {
                    onActiveBizDateChange?.(today);
                  }
                }}
                onRequestEdit={(target) => {
                  clearBrowserAppealSuccessSession(selectedAccount.id, today);
                  setSubmittedViewActive(false);
                  onRequestEditSubmittedReport(target);
                  setRequestedMode("editToday");
                }}
                onCreateAnother={onCreateAnother}
              />
            ) : null}
        </div>

    </>
  );
}
