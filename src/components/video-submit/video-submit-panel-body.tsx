import { useRef, useState } from "react";
import { Compass, Film, PencilLine, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { ScreenshotInspector } from "@/components/submission/截图检视器";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Metric } from "@/components/ui/metric";
import { SectionHeading } from "@/components/ui/section-heading";
import { ZenFinishedIllustration, ColophonMark } from "@/components/editorial/editorial-illustrations";
import { DashboardActivityError } from "./dashboard-activity-error";
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
  shouldShowBlockedStateCard,
  activeBizDate,
  today,
  submittedViewActive,
  setSubmittedViewActive,
  primarySummary,
  handleGoToTopics,
  activeDateStatus,
  activeExemptionState,
  shouldShowActivityErrorCard,
  loadActivity,
  shouldShowActivityLoadingCard,
  shouldShowHistoricalSubmittedCard,
  activeDateReport,
  requestedEditBizDate,
  onRequestEditSubmittedReport,
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
}: VideoSubmitPanelBodyProps) {
  // 硬伤 3：回执凭证缩略图复用同屏画中画检视器（与截图槽位区同源组件）
  const [inspectingReceipt, setInspectingReceipt] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const receiptTriggerRef = useRef<HTMLElement | null>(null);

  return (
    <>
        {/* 主内容区 - 单一微环纯排版容器，消灭纸内套娃 */}
        <Card className="p-4 sm:p-6 space-y-4 sm:space-y-5" ref={formAnchorRef}>
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

            {/* 已提交概览卡片（禅意归档态 · 微气垫底色消灭白卡套娃） */}
            {isPrimarySummaryMode && activeBizDate === today && !submittedViewActive ? (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
              <Card className="bg-gradient-to-br from-white via-white to-[#F1F1F0]/60 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
                  {/* 左侧：禅意线描插图 + 温润寄语 */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="shrink-0 hidden xs:block sm:block">
                      <ZenFinishedIllustration size={72} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral" className="text-[#78716C] before:bg-[#4B6B4E]">今日已归档</Badge>
                        <span className="text-[12px] sm:text-[14px] font-normal text-[#78716C]">
                          已完成今日记录 · {activeDateReports.length || 1} 条作品
                        </span>
                      </div>
                      <SectionHeading as="h3">
                        万事俱备，静候佳音
                      </SectionHeading>
                      <p className="text-[12px] sm:text-[14px] text-[#78716C]">
                        今日作品已妥善入库，数据已同步至总览。
                      </p>
                    </div>
                  </div>

                  {/* 右侧：3 核心指标 + 操作 */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 shrink-0">
                    {/* 指标三联 */}
                    <div className="grid grid-cols-3 divide-x divide-[#E2E2DF]/60 py-1">
                      <div className="px-2 sm:px-3.5 min-w-0 text-center">
                        <div className="text-[12px] font-normal text-[#78716C] truncate">播放量</div>
                        <Metric
                          className="mt-0.5 sm:mt-1"
                          value={
                            primarySummary.playCount !== null
                              ? primarySummary.playCount >= 10000
                                ? `${(primarySummary.playCount / 10000).toFixed(1)}万`
                                : primarySummary.playCount.toLocaleString()
                              : "—"
                          }
                        />
                      </div>
                      <div className="px-2 sm:px-3.5 min-w-0 text-center">
                        <div className="text-[12px] font-normal text-[#78716C] truncate">点赞量</div>
                        <Metric
                          className="mt-0.5 sm:mt-1"
                          value={
                            primarySummary.likes !== null
                              ? primarySummary.likes >= 10000
                                ? `${(primarySummary.likes / 10000).toFixed(1)}万`
                                : primarySummary.likes.toLocaleString()
                              : "—"
                          }
                        />
                      </div>
                      <div className="px-2 sm:px-3.5 min-w-0 text-center">
                        <div className="text-[12px] font-normal text-[#78716C] truncate">完播率</div>
                        <Metric
                          className="mt-0.5 sm:mt-1"
                          value={primarySummary.completionRate ?? "—"}
                        />
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-col gap-2 shrink-0 w-full sm:w-[140px]">
                      <Button
                        type="button"
                        size="m"
                        className="w-full"
                        onClick={handleGoToTopics}
                      >
                        <Compass className="size-3.5 mr-1" />
                        <span>挑选明日选题</span>
                      </Button>
                      <div className="flex items-center gap-1 w-full">
                        <Button
                          type="button"
                          variant="secondary"
                          size="s"
                          className="flex-1"
                          onClick={() => setRequestedMode("createAnother")}
                        >
                          <Plus className="size-3 mr-1" />
                          再传一条
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="s"
                          className="flex-1"
                          onClick={() => setRequestedMode("editToday")}
                        >
                          <PencilLine className="size-3 mr-1" />
                          修改今日数据
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 今日已录入作品回执清单（消灭空白悬空与玩具感，提供安心确认） */}
                {(() => {
                  const displayReports = activeDateReports.length > 0
                    ? activeDateReports
                    : (activeDateReport ? [activeDateReport] : []);
                  if (displayReports.length === 0) return null;

                  return (
                    <div className="mt-4 sm:mt-5 pt-4 border-t border-[#E2E2DF]/60 space-y-2.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className=" text-[#141413]">今日已入账作品回执</span>
                        <span className="text-[#78716C]">
                          共 {displayReports.length} 篇 · 凭证与数据已核验
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {displayReports.map((report, idx) => {
                          const isSelected = report.id === selectedReportId || displayReports.length === 1;
                          const reportTitle = report.title || "未命名今日作品";
                          const publishedTime = report.published_at || report.report_date || "今日";
                          // undefined = 服务端历史行未携带该字段（信息未知，诚实隐藏）；null = 乐观行确知未选题
                          const topicTitle = report.topic_title;
                          const assetUrl = report.screenshot_url ?? null;

                          return (
                            <div
                              key={report.id || `receipt-${idx}`}
                              onClick={() => {
                                if (report.id) setSelectedReportId(report.id);
                              }}
                              className={cn(
                                "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer text-left",
                                isSelected
                                  ? "bg-[#F1F1F0] border-[#E2E2DF]"
                                  : "bg-white/70 border-[#E2E2DF] hover:border-[#D97757]/30 hover:bg-white",
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {assetUrl ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      receiptTriggerRef.current = e.currentTarget;
                                      setInspectingReceipt({
                                        url: assetUrl,
                                        label: `${reportTitle} · 凭证核对`,
                                      });
                                    }}
                                    className="relative size-10 sm:size-11 shrink-0 rounded-md border border-[#E2E2DF] bg-[#F1F1F0] overflow-hidden flex items-center justify-center cursor-zoom-in hover:border-[#78716C]/40 transition-colors"
                                    title="点击同屏核对凭证原图"
                                    aria-label={`同屏核对《${reportTitle}》凭证原图`}
                                  >
                                    <ScreenshotImage
                                      src={assetUrl}
                                      alt={reportTitle}
                                      variant="thumb"
                                      className="size-full object-cover"
                                    />
                                  </button>
                                ) : (
                                  <div className="relative size-10 sm:size-11 shrink-0 rounded-md border border-[#E2E2DF] bg-[#F1F1F0] overflow-hidden flex items-center justify-center">
                                    <Film className="size-4 text-[#78716C]" />
                                  </div>
                                )}
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[14px] sm:text-[14px] text-[#141413] truncate max-w-[240px] sm:max-w-md">
                                      {reportTitle}
                                    </p>
                                    <span className="inline-flex items-center gap-1 text-[12px] text-[#78716C] shrink-0 ">
                                      <span className="size-1.5 rounded-full bg-[#4B6B4E]" />
                                      履约核验通过
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[12px] text-[#78716C]">
                                    <span className="tabular-nums">发布时间：{publishedTime}</span>
                                    {topicTitle !== undefined && (
                                      <>
                                        <span>·</span>
                                        <span className={topicTitle ? "text-[#1F1E1D]" : "text-[#78716C]/70"}>
                                          {topicTitle ? `选题：${topicTitle}` : "未关联选题"}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                <div className="hidden sm:flex items-center gap-2.5 text-[12px] text-[#78716C] px-2 py-1 rounded-md bg-[#F1F1F0]/60">
                                  <span>播放 {report.play_count !== null ? report.play_count.toLocaleString() : "—"}</span>
                                  <span>·</span>
                                  <span>完播 {report.completion_rate ?? "—"}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (report.id) setSelectedReportId(report.id);
                                    setRequestedMode("editToday");
                                  }}
                                  className="inline-flex items-center gap-1 text-[12px] text-[#78716C] hover:text-[#141413] px-2 py-1 rounded-md hover:bg-[#EBEBE9] transition-colors cursor-pointer"
                                  title="修改该条作品数据"
                                >
                                  <PencilLine className="size-3" />
                                  <span>修改</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                </Card>
              </motion.div>

              {/* 完卷微符与落款寄语 */}
              <div className="flex flex-col items-center justify-center gap-1 pt-1 pb-4 select-none">
                <ColophonMark className="py-0 gap-2" />
                <span className="text-[12px] tracking-wider text-[#A8A29E]">
                  今日创作已立卷 · 数据已妥善入库
                </span>
              </div>
            </>
          ) : null}

            {/* 豁免/请假状态卡片 */}
            {selectedAccount && shouldShowBlockedStateCard ? (
              <Card className="mb-6 p-4 sm:p-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full",
                        activeDateStatus.state === "waive"
                          ? "bg-status-success/10 text-status-success"
                          : "bg-status-warning/10 text-status-warning",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          activeDateStatus.state === "waive" ? "bg-current text-status-success" : "bg-current text-status-warning",
                        )}
                      />
                    </span>
                    <span className="text-[14px] font-normal text-[#1F1E1D]">
                      {activeBizDate === today ? `今日${activeDateStatus.label}` : `${activeDateStatus.label}状态`}
                    </span>
                  </div>
                  <div>
                    <SectionHeading as="h3">
                      {activeBizDate} · 豁免申请 ({activeDateStatus.label}) {/* 停笔调养 */}
                    </SectionHeading>
                    <p className="mt-1 text-[14px] leading-relaxed text-[#78716C]">
                      {activeDateStatus.description}
                    </p>
                    {activeExemptionState.reason && (
                      <p className="mt-1 text-[14px] text-[#78716C]">
                        事由：{activeExemptionState.reason}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ) : null}

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
              />
            ) : null}
        </Card>

        {/* 完卷徽记 (Colophon) - 独立平铺于底层桌面画布，作为整页人文落款印章 */}
        <div className="flex items-center justify-center gap-3 pt-3 pb-8 select-none" aria-hidden="true">
          <span className="h-[1px] w-8 bg-[#E2E2DF]"></span>
          <span className="text-[12px] text-[#78716C] tracking-widest">✦ 慎思 · 笃行 · 入卷</span>
          <span className="h-[1px] w-8 bg-[#E2E2DF]"></span>
        </div>

        {inspectingReceipt && (
          <ScreenshotInspector
            url={inspectingReceipt.url}
            label={inspectingReceipt.label}
            testId="receipt-inspector"
            onClose={() => setInspectingReceipt(null)}
            onReturnFocus={() => receiptTriggerRef.current?.focus()}
          />
        )}

    </>
  );
}
