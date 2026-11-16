import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardActivityError } from "./dashboard-activity-error";
import { TodaySubmittedCard } from "./today-submitted-card";
import { VideoSubmitFormV2 } from "@/app/(app)/dashboard/video-submit-form-v2";
import { WorkbenchNoticeBar, buildExemptionReviewNoticeItem } from "@/app/(app)/dashboard/components/workbench-notice-bar";
import { cn } from "@/lib/utils";
import { getPublishedDateKey } from "@/lib/date-semantics";

import type { VideoSubmitPanelBodyProps } from "./video-submit-panel-body.types";

export function VideoSubmitPanelBody({
  formAnchorRef,
  shouldShowForm,
  isExemptionPending,
  dismissedPendingExemption,
  userExemptionReviewNotice,
  dismissedReviewNotice,
  handleDismissReviewNotice,
  dismissPendingExemption,
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
  return (
    <>
        {/* 主内容区 - 试点：撤外围围合，直接落底纸，与页头/日历条共用同一条对齐轴 */}
        <div className="space-y-4 sm:space-y-5" ref={formAnchorRef}>
            {/* 待审批豁免与审批结果提示区 (仅在表单未挂载时在此展示；表单挂载时由表单内的 WorkbenchNoticeCapsule 统一内联) */}
            {!shouldShowForm &&
              ((isExemptionPending && !dismissedPendingExemption) ||
                (userExemptionReviewNotice && !dismissedReviewNotice)) && (
                <WorkbenchNoticeBar
                  notices={[
                    ...(userExemptionReviewNotice && !dismissedReviewNotice
                      ? [
                          buildExemptionReviewNoticeItem(
                            userExemptionReviewNotice,
                            handleDismissReviewNotice,
                          ),
                        ]
                      : []),
                    ...(isExemptionPending && !dismissedPendingExemption
                      ? [
                          {
                            id: "pending-exemption",
                            type: "exemption_pending" as const,
                            statusTone: "amber" as const,
                            title: "特殊豁免申请审批中",
                            description: "· 正在等待管理员审批",
                            onDismiss: dismissPendingExemption,
                          },
                        ]
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

            {/* 豁免/请假状态摘要 - 第二轮：已上移至履约辅助带（video-submit-panel-v2） */}

            {shouldShowActivityErrorCard ? (
              <div className="py-8">
                <DashboardActivityError
                  message={activeDateStatus.errorMessage ?? "历史记录加载稍有阻滞，请重试后再补交。"}
                  onRetry={() => void loadActivity()}
                />
              </div>
            ) : null}

            {shouldShowActivityLoadingCard ? (
              <Card className="flex flex-row items-center gap-2 p-3">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-warning/10 text-status-warning">
                  <span className="size-1.5 rounded-full bg-current text-status-warning animate-pulse" />
                </span>
                <span className="font-normal text-[#1F1E1D]">正在核对历史纪事</span>
                <span className="text-[#78716C]">· 正在确认 {activeBizDate} 是否已有日报，核对完成前暂不开放补交</span>
              </Card>
            ) : null}

            {shouldShowHistoricalSubmittedCard && activeDateReport ? (
              <Card className="mb-6 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-current text-status-success" />
                      <span className="text-[14px] font-normal text-[#1F1E1D]">已立卷手稿 · 发布日 {getPublishedDateKey(activeDateReport) ?? "未知"}</span>
                    </div>
                    <p className="text-[14px] text-[#141413]">
                      {activeDateReport.title || "未命名手稿"}
                    </p>
                    {activeDateReports.length > 1 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {activeDateReports.map((report) => (
                          <button
                            key={report.id}
                            type="button"
                            onClick={() => setSelectedReportId(report.id)}
                            className={cn(
                              "max-w-[180px] truncate rounded-md border px-2 py-1 text-left text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#78716C]/40",
                              report.id === activeDateReport.id
                                ? "border-[#E2E2DF] bg-[#F1F1F0] text-[#141413]"
                                : "border-[#E2E2DF] bg-white text-[#1F1E1D]",
                            )}
                          >
                            {report.title || "未命名作品"}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="default"
                      className="h-7 rounded-md border border-[#E2E2DF] bg-[#F1F1F0] hover:bg-[#EBEBE9] text-[12px] font-normal text-[#1F1E1D] shadow-input transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
                      onClick={() => setRequestedMode("createAnother")}
                    >
                      <Plus className="mr-1 size-3" />
                      再传一条
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="default"
                      className="h-7 rounded-md border border-[#E2E2DF] bg-[#F1F1F0] hover:bg-[#EBEBE9] text-[12px] font-normal text-[#1F1E1D] shadow-input transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
                      onClick={() => setRequestedMode("editToday")}
                    >
                      查看并修改
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}

            {shouldShowEditDetailLoading ? (
              <div className="py-14 flex flex-col items-center justify-center text-center space-y-3">
                <div className="relative flex h-10 w-10 items-center justify-center">
                  <span className="size-2 rounded-full bg-current text-[#78716C] motion-safe:animate-ping" />
                  <span className="absolute size-2 rounded-full bg-current text-[#78716C]" />
                </div>
                <div className="space-y-1">
                  <p className="text-[14px] font-normal text-[#1F1E1D]">正在调阅作品原稿档案</p>
                  <p className="text-[12px] text-[#78716C]">正在核对旧视频、24小时指标与创作伙伴信息...</p>
                </div>
              </div>
            ) : null}

            {shouldShowEditDetailError ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <EmptyState
                  title={
                    editDetailLoadState.error?.includes("没有可编辑")
                      ? "未寻得该日期的视频底稿"
                      : "作品底稿载入暂缓"
                  }
                  description={
                    editDetailLoadState.error?.includes("没有可编辑")
                      ? "该归属日未收录可编辑的原视频手稿，您可返回概览或切换其他日期。"
                      : (editDetailLoadState.error || "数据调阅稍有滞碍，原视频与指标底稿暂未就绪。")
                  }
                  action={
                    !editDetailLoadState.error?.includes("没有可编辑")
                      ? {
                          label: "重新载入",
                          onClick: () => setEditDetailRequestVersion((v) => v + 1),
                        }
                      : {
                          label: "返回概览",
                          onClick: () => {
                            clearSubmittedEditTarget();
                            setRequestedMode(null);
                            if (activeBizDate !== today) {
                              onActiveBizDateChange?.(today);
                            }
                          },
                        }
                  }
                />
                {!editDetailLoadState.error?.includes("没有可编辑") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearSubmittedEditTarget();
                      setRequestedMode(null);
                      if (activeBizDate !== today) {
                        onActiveBizDateChange?.(today);
                      }
                    }}
                    className="mt-2 text-[12px] text-[#78716C] hover:text-[#1F1E1D]"
                  >
                    返回概览
                  </Button>
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
                userExemptionReviewNotice={userExemptionReviewNotice}
                isExemptionPending={isExemptionPending && !dismissedPendingExemption}
                onDismissPendingExemption={dismissPendingExemption}
                onSubmitted={handleSubmitted}
                onViewHistory={onViewHistory}
                onViewVideo={onViewVideo}
                onProgressChange={onFormProgressChange}
                onCancel={() => {
                  clearSubmittedEditTarget();
                  setSubmittedViewActive(false);
                  setRequestedMode(null);
                  if (activeBizDate !== today) {
                    onActiveBizDateChange?.(today);
                  }
                }}
                onRequestEdit={(target) => {
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
