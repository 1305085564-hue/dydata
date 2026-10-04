"use client";

import { createPortal } from "react-dom";
import { X, Edit2, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { useTopicWorkBreakdownState } from "@/lib/topics/domain/work-breakdown";
import { worksCacheKey } from "@/lib/topics/domain/work-breakdown";
import { useTopicWorkBreakdownData } from "@/lib/topics/data/work-breakdown";
import type { SubTopicItem } from "./types";
import { BreakdownDetailContent } from "./breakdown/BreakdownDetailContent";
import { BreakdownDetailFooter } from "./breakdown/BreakdownDetailFooter";
import { BreakdownEditForm } from "./breakdown/BreakdownEditForm";
import { BreakdownDeleteConfirm } from "./breakdown/BreakdownDeleteConfirm";

export interface TopicWorkBreakdownDrawerProps {
  subTopicId: string | null;
  /** 卡片已有数据秒级透传，避免抽屉打开时白屏等待接口返回 */
  initialSubTopic?: SubTopicItem | null;
  isWritingByCurrentUser?: boolean;
  onClose: () => void;
  onGoToFeishu?: (topic: SubTopicItem) => void;
  /** 服务端 bootstrap 下发的当前登录用户 ID，用于仅作者可见的编辑/移出操作 */
  currentUserId?: string | null;
  /** 具备 review_content 且与目标同团队时，也可编辑和软移出 */
  canManageTopicLibrary?: boolean;
  /** 具备 review_content 权限时可直接跳转至视频复盘 */
  canReviewContent?: boolean;
  /** 选题被编辑后通知列表就地刷新（不额外发请求） */
  onSubTopicUpdated?: (subTopic: SubTopicItem) => void;
  /** 选题被移出题库后通知列表移除该行并收起抽屉 */
  onSubTopicRemoved?: (subTopicId: string) => void;
  /** 上一篇 / 下一篇导航能力 */
  hasPrevTopic?: boolean;
  hasNextTopic?: boolean;
  onNavigateTopic?: (direction: "prev" | "next") => void;
  currentTopicIndex?: number;
  totalTopicsCount?: number;
}

export function TopicWorkBreakdownDrawer({
  subTopicId,
  initialSubTopic,
  isWritingByCurrentUser = false,
  onClose,
  onGoToFeishu,
  currentUserId,
  canManageTopicLibrary = false,
  canReviewContent: canReviewContentProp,
  onSubTopicUpdated,
  onSubTopicRemoved,
  hasPrevTopic = false,
  hasNextTopic = false,
  onNavigateTopic,
  currentTopicIndex,
  totalTopicsCount,
}: TopicWorkBreakdownDrawerProps) {
  const state = useTopicWorkBreakdownState({
    initialSubTopic,
    subTopicId,
    onClose,
    onNavigateTopic,
    hasPrevTopic,
    hasNextTopic,
  });
  const data = useTopicWorkBreakdownData({
    subTopicId,
    initialSubTopic,
    onSubTopicUpdated,
    onSubTopicRemoved,
    setIsLoading: state.setIsLoading,
    setSubTopicInfo: state.setSubTopicInfo,
    setWorksData: state.setWorksData,
    setClaimsData: state.setClaimsData,
    setDetailError: state.setDetailError,
    setClaimsError: state.setClaimsError,
    setMembershipRequired: state.setMembershipRequired,
    loadRequestId: state.loadRequestId,
    worksCache: state.worksCache,
    setWorksCache: state.setWorksCache,
    setWorksQuery: state.setWorksQuery,
    setWorksLoading: state.setWorksLoading,
    setWorksError: state.setWorksError,
    worksRequestId: state.worksRequestId,
    setEditTitle: state.setEditTitle,
    setEditHook: state.setEditHook,
    setEditEmotionTag: state.setEditEmotionTag,
    setEditAudience: state.setEditAudience,
    setEditTitleError: state.setEditTitleError,
    setIsSubmittingEdit: state.setIsSubmittingEdit,
    setDrawerMode: state.setDrawerMode,
    setIsDeleting: state.setIsDeleting,
    setDeleteErrorMsg: state.setDeleteErrorMsg,
    handleClose: state.handleClose,
    subTopicInfo: state.subTopicInfo,
    editTitle: state.editTitle,
    editHook: state.editHook,
    editEmotionTag: state.editEmotionTag,
    editAudience: state.editAudience,
  });
  const {
    isMounted,
    isLoading,
    subTopicInfo,
    worksData,
    claimsData,
    detailError,
    claimsError,
    membershipRequired,
    worksCache,
    worksQuery,
    worksLoading,
    worksError,
    editTitle,
    setEditTitle,
    editHook,
    setEditHook,
    editEmotionTag,
    setEditEmotionTag,
    editAudience,
    setEditAudience,
    editTitleError,
    isSubmittingEdit,
    drawerMode,
    setDrawerMode,
    isDeleting,
    deleteErrorMsg,
    setDeleteErrorMsg,
    handleClose,
    closeBtnRef,
  } = state;
  const {
    loadWorksPage,
    openEditDialog,
    handleEditSubmit,
    handleDeleteSubmit,
  } = data;
  const canReviewContent = canReviewContentProp ?? canManageTopicLibrary;
  const isOwner = Boolean(currentUserId && subTopicInfo?.created_by === currentUserId);

  // 近 7 天热度三值：只使用服务端唯一口径数据，缺失显示未知态，不回退累计认领或全部作品数
  const total7dParticipants =
    typeof claimsData?.recent7dSummary?.participants === "number"
      ? claimsData.recent7dSummary.participants
      : null;
  const completed7dCount =
    typeof claimsData?.recent7dSummary?.completedCount === "number"
      ? claimsData.recent7dSummary.completedCount
      : null;
  const inProgress7dCount =
    typeof claimsData?.recent7dSummary?.inProgressCount === "number"
      ? claimsData.recent7dSummary.inProgressCount
      : null;

  // 历史指标严格读取真实字段，不存在则统一显示 null / "—"
  const bestPlay = worksData?.summary?.internalMetrics?.bestPlayCount ?? worksData?.summary?.bestPlayCount ?? null;
  const avgPlay = worksData?.summary?.averagePlayCount ?? null;
  const qualifiedCount = worksData?.summary?.qualifiedWorkCount ?? null;

  const activeWorks =
    worksCache[worksCacheKey(worksQuery.sort, worksQuery.page)] ?? null;
  const worksTotalItems = activeWorks?.pagination.totalItems ?? worksData?.pagination.totalItems ?? 0;

  if (
    !subTopicId ||
    !isMounted ||
    typeof window === "undefined" ||
    !document?.body
  )
    return null;

  return createPortal(
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-[#141413]/20 backdrop-blur-xs z-[70] transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* 抽屉主体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed top-[var(--app-top-offset,64px)] bottom-0 right-0 z-[70] flex min-h-0 max-h-[calc(100dvh-var(--app-top-offset,64px))] w-full max-w-xl flex-col overflow-hidden border-l border-[#E2E2DF] bg-[#FCFCFB]/95 p-4 sm:p-6 shadow-claude-dialog backdrop-blur-xl animate-in slide-in-from-right duration-200"
      >
        {/* 顶部标题栏 */}
        <div className="shrink-0">
          <div className="flex items-start justify-between pb-3.5 border-b border-[#E2E2DF]/60 mb-4 pt-1">
            <div className="min-w-0 pr-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C] bg-[#F1F1F0] px-2 py-0.5 rounded-md">
                  {drawerMode === "edit"
                    ? "编辑"
                    : drawerMode === "confirm_delete"
                      ? "操作确认"
                      : subTopicInfo?.topics?.name || "干货选题"}
                </span>
                {drawerMode === "detail" && subTopicInfo?.source_type === "external" && (
                  <Badge variant="accent">外部收集干货</Badge>
                )}
              </div>
              <SectionHeading
                as="h3"
                id="drawer-title"
                className="line-clamp-2 tracking-tight"
              >
                {drawerMode === "edit"
                  ? "编辑干货选题"
                  : drawerMode === "confirm_delete"
                    ? "移出干货选题库"
                    : subTopicInfo?.title || "选题详情"}
              </SectionHeading>
            </div>
            <div className="flex items-start gap-1 shrink-0">
              {drawerMode === "detail" && (isOwner || canManageTopicLibrary) && (
                <>
                  <button
                    type="button"
                    onClick={openEditDialog}
                    className="rounded-md p-1.5 text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors cursor-pointer min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                    aria-label="编辑选题"
                    title="编辑选题"
                  >
                    <Edit2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteErrorMsg(null);
                      setDrawerMode("confirm_delete");
                    }}
                    className="rounded-md p-1.5 text-[#78716C] hover:bg-status-danger/[0.08] hover:text-status-danger transition-colors cursor-pointer min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                    aria-label="移出题库"
                    title="移出题库"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
              {drawerMode === "detail" && onNavigateTopic && (
                <div className="flex items-center bg-[#F1F1F0] rounded-md p-0.5 border border-[#E2E2DF]/60 text-[12px] text-[#78716C] mr-1 select-none">
                  <button
                    type="button"
                    onClick={() => onNavigateTopic("prev")}
                    disabled={!hasPrevTopic}
                    title="上一篇 (快捷键 K 或 ↑)"
                    aria-label="上一篇选题"
                    className="p-1 rounded-md text-[#78716C] hover:text-[#141413] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  {currentTopicIndex !== undefined && totalTopicsCount !== undefined && totalTopicsCount > 0 && (
                    <span className="px-1 text-[12px] tabular-nums font-normal text-[#78716C]">
                      {currentTopicIndex + 1}/{totalTopicsCount}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigateTopic("next")}
                    disabled={!hasNextTopic}
                    title="下一篇 (快捷键 J 或 ↓)"
                    aria-label="下一篇选题"
                    className="p-1 rounded-md text-[#78716C] hover:text-[#141413] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </div>
              )}
              {drawerMode !== "detail" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="s"
                  onClick={() => setDrawerMode("detail")}
                >
                  ← 返回详情
                </Button>
              ) : (
                <button
                  ref={closeBtnRef}
                  onClick={handleClose}
                  className="rounded-md p-1.5 text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                  aria-label="关闭抽屉"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
          </div>
        </div>


        {/* 抽屉滚动内容 (仅详情模式) */}
        {drawerMode === "detail" && (
          <BreakdownDetailContent
            isLoading={isLoading}
            subTopicInfo={subTopicInfo}
            membershipRequired={membershipRequired}
            detailError={detailError}
            handleClose={handleClose}
            bestPlay={bestPlay}
            avgPlay={avgPlay}
            qualifiedCount={qualifiedCount}
            worksTotalItems={worksTotalItems}
            total7dParticipants={total7dParticipants}
            completed7dCount={completed7dCount}
            inProgress7dCount={inProgress7dCount}
            claimsError={claimsError}
            claimsData={claimsData}
            worksQuery={worksQuery}
            loadWorksPage={loadWorksPage}
            worksError={worksError}
            worksLoading={worksLoading}
            activeWorks={activeWorks}
            canReviewContent={canReviewContent}
          />
        )}

        <BreakdownDetailFooter
          subTopicId={subTopicId}
          subTopicInfo={subTopicInfo}
          isWritingByCurrentUser={isWritingByCurrentUser}
          onGoToFeishu={onGoToFeishu}
          drawerMode={drawerMode}
        />

        {drawerMode === "edit" ? (
          <BreakdownEditForm
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            editHook={editHook}
            setEditHook={setEditHook}
            editEmotionTag={editEmotionTag}
            setEditEmotionTag={setEditEmotionTag}
            editAudience={editAudience}
            setEditAudience={setEditAudience}
            editTitleError={editTitleError}
            isSubmittingEdit={isSubmittingEdit}
            handleEditSubmit={handleEditSubmit}
            setDrawerMode={setDrawerMode}
            drawerMode={drawerMode}
          />
        ) : drawerMode === "confirm_delete" ? (
          <BreakdownDeleteConfirm
            deleteErrorMsg={deleteErrorMsg}
            isDeleting={isDeleting}
            handleDeleteSubmit={handleDeleteSubmit}
            setDrawerMode={setDrawerMode}
          />
        ) : null}
      </div>
    </>,
    document.body,
  );
}
