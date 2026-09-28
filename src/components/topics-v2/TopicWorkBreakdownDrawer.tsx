"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  X,
  AlertTriangle,
  FileText,
  Sparkles,
  Flame,
  Trophy,
  Building2,
  Globe2,
  Loader2,
  Edit2,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  fetchTopicJson,
  parseClaimsResponse,
  parseSubTopicDetailResponse,
  parseTopicWorksResponse,
  isTeamMembershipRequiredError,
  DETAIL_PAGE_SIZE,
} from "@/lib/topics/v2-client-contract";
import { buildDashboardTopicHref } from "@/lib/topics/dashboard-context";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { Metric } from "@/components/ui/metric";
import { ListRow } from "@/components/ui/list-row";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  TopicClaimsDetailResponse,
  TopicWorkItem,
  TopicWorksResponse,
  SubTopicItem,
} from "./types";

const emptySubscribe = () => () => {};

type WorksSort = "best" | "recent";

function worksCacheKey(sort: WorksSort, page: number) {
  return `${sort}:${page}`;
}

/** /works 接口原始行 → 抽屉统一卡片模型 */
function mapRawWorksToResponse(data: unknown): TopicWorksResponse {
  const parsed = parseTopicWorksResponse(data);
  return {
    items: parsed.items,
    similarReferences: parsed.similarReferences,
    summary: parsed.summary,
    pagination: parsed.pagination,
  };
}

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
  onSubTopicUpdated,
  onSubTopicRemoved,
  hasPrevTopic = false,
  hasNextTopic = false,
  onNavigateTopic,
  currentTopicIndex,
  totalTopicsCount,
}: TopicWorkBreakdownDrawerProps) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [subTopicInfo, setSubTopicInfo] = useState<SubTopicItem | null>(() => initialSubTopic ?? null);
  const [worksData, setWorksData] = useState<TopicWorksResponse | null>(null);
  const [claimsData, setClaimsData] =
    useState<TopicClaimsDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [membershipRequired, setMembershipRequired] = useState(false);
  const loadRequestId = useRef(0);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 作品分页 + 排序：详情自带的首页（最高播放）作为缓存种子，翻页/切排序才发请求
  const [worksCache, setWorksCache] = useState<Record<string, TopicWorksResponse>>({});
  const [worksQuery, setWorksQuery] = useState<{ page: number; sort: WorksSort }>({ page: 1, sort: "best" });
  const [worksLoading, setWorksLoading] = useState(false);
  const [worksError, setWorksError] = useState<string | null>(null);
  const worksRequestId = useRef(0);

  // 编辑表单字段（仅选题作者可见）
  const [editTitle, setEditTitle] = useState("");
  const [editHook, setEditHook] = useState("");
  const [editEmotionTag, setEditEmotionTag] = useState("");
  const [editAudience, setEditAudience] = useState("");
  const [editTitleError, setEditTitleError] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // 抽屉内模式切换（detail | edit | confirm_delete · 彻底消除抽屉套弹窗）
  const [drawerMode, setDrawerMode] = useState<"detail" | "edit" | "confirm_delete">("detail");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    const targetEl = previousActiveElement.current;
    onClose();
    if (targetEl && typeof targetEl.focus === "function") {
      window.setTimeout(() => {
        try {
          targetEl.focus();
        } catch {
          // ignore
        }
      }, 50);
    }
  }, [onClose]);

  // Focus Management & Esc Key Support
  useEffect(() => {
    if (subTopicId) {
      previousActiveElement.current =
        document.activeElement as HTMLElement | null;
      try {
        closeBtnRef.current?.focus();
      } catch {
        // ignore
      }
    }
    return () => {
      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === "function"
      ) {
        try {
          previousActiveElement.current.focus();
        } catch {
          // ignore
        }
      }
    };
  }, [initialSubTopic, subTopicId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && subTopicId) {
        handleClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (drawerMode !== "detail") return;

      if ((e.key === "j" || e.key === "J" || e.key === "ArrowDown") && hasNextTopic) {
        e.preventDefault();
        onNavigateTopic?.("next");
      } else if ((e.key === "k" || e.key === "K" || e.key === "ArrowUp") && hasPrevTopic) {
        e.preventDefault();
        onNavigateTopic?.("prev");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [subTopicId, drawerMode, handleClose, hasNextTopic, hasPrevTopic, onNavigateTopic]);

  const loadWorksPage = useCallback(
    async (page: number, sort: WorksSort) => {
      if (!subTopicId) return;
      const key = worksCacheKey(sort, page);
      setWorksQuery({ page, sort });
      setWorksError(null);
      if (worksCache[key]) return;

      const requestId = ++worksRequestId.current;
      setWorksLoading(true);
      try {
        const data = await fetchTopicJson(
          `/api/topics/sub-topics/${subTopicId}/works?page=${page}&page_size=${DETAIL_PAGE_SIZE}&sort=${sort}`,
        );
        if (requestId !== worksRequestId.current) return;
        const mapped = mapRawWorksToResponse(data);
        setWorksCache((prev) => ({ ...prev, [key]: mapped }));
      } catch (error) {
        if (requestId !== worksRequestId.current) return;
        setWorksError(error instanceof Error ? error.message : "作品加载失败");
      } finally {
        if (requestId === worksRequestId.current) setWorksLoading(false);
      }
    },
    [subTopicId, worksCache],
  );

  const loadData = useCallback(async () => {
    if (!subTopicId) return;
    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setSubTopicInfo((prev) => prev?.id === subTopicId ? prev : (initialSubTopic?.id === subTopicId ? initialSubTopic : null));
    setWorksData(null);
    setClaimsData(null);
    setDetailError(null);
    setClaimsError(null);
    setMembershipRequired(false);
    setWorksCache({});
    setWorksQuery({ page: 1, sort: "best" });
    setWorksError(null);

    // detail 接口内部已用相同参数（sort=best, page=1, pageSize=20）查询 works 并随详情返回，
    // 不再单独请求 /works，避免同一份作品查两次
    const [detailResult, claimsResult] = await Promise.allSettled([
      fetchTopicJson(`/api/topics/sub-topics/${subTopicId}`),
      fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/claims`),
    ]);

    if (requestId !== loadRequestId.current) return;

    if ([detailResult, claimsResult].some(
      (result) => result.status === "rejected" && isTeamMembershipRequiredError(result.reason),
    )) {
      setMembershipRequired(true);
      setIsLoading(false);
      return;
    }

    if (detailResult.status === "fulfilled") {
      try {
        const parsedDetail = parseSubTopicDetailResponse(detailResult.value);
        setSubTopicInfo(parsedDetail.subTopic as SubTopicItem);
        setWorksData(parsedDetail.works);
        setWorksCache({ [worksCacheKey("best", 1)]: parsedDetail.works });
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "详情结构无效");
      }
    } else {
      setDetailError(
        detailResult.reason instanceof Error
          ? detailResult.reason.message
          : "详情加载失败",
      );
    }

    if (claimsResult.status === "fulfilled") {
      try {
        const parsed = parseClaimsResponse(claimsResult.value);
        setClaimsData({
          candidateCount: parsed.candidateCount,
          scriptingCount: parsed.scriptingCount,
          inProgressCount: parsed.inProgressCount,
          claims: parsed.claims.map((claim) => ({
            id: claim.id ?? `${claim.userId}:${claim.status}`,
            userId: claim.userId,
            displayName: claim.displayName,
            status: claim.status,
            claimedAt: claim.claimedAt,
          })),
          recent7dSummary: parsed.recent7dSummary,
        });
      } catch (error) {
        setClaimsError(
          error instanceof Error ? error.message : "参与动态结构无效",
        );
      }
    } else {
      setClaimsError(
        claimsResult.reason instanceof Error
          ? claimsResult.reason.message
          : "参与动态加载失败",
      );
    }
    setIsLoading(false);
  }, [initialSubTopic, subTopicId]);

  useEffect(() => {
    if (subTopicId) void loadData();
  }, [loadData, subTopicId]);

  const openEditDialog = useCallback(() => {
    if (!subTopicInfo) return;
    setEditTitle(subTopicInfo.title ?? "");
    setEditHook(subTopicInfo.hook ?? "");
    setEditEmotionTag(subTopicInfo.emotion_tag ?? "");
    setEditAudience(subTopicInfo.audience ?? "");
    setEditTitleError("");
    setDrawerMode("edit");
  }, [subTopicInfo]);

  const handleEditSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!subTopicId) return;
      if (!editTitle.trim()) {
        setEditTitleError("标题不能为空");
        return;
      }
      setEditTitleError("");
      setIsSubmittingEdit(true);
      try {
        const data = await fetchTopicJson(`/api/topics/sub-topics/${subTopicId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle.trim(),
            hook: editHook.trim() || null,
            emotion_tag: editEmotionTag.trim() || null,
            audience: editAudience.trim() || null,
          }),
        });
        const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const updatedRaw = (payload.value ?? payload) as Record<string, unknown>;
        setSubTopicInfo((prev) =>
          prev
            ? {
                ...prev,
                title: typeof updatedRaw.title === "string" ? updatedRaw.title : prev.title,
                hook: typeof updatedRaw.hook === "string" || updatedRaw.hook === null ? updatedRaw.hook as string | null : prev.hook,
                emotion_tag: typeof updatedRaw.emotion_tag === "string" || updatedRaw.emotion_tag === null ? updatedRaw.emotion_tag as string | null : prev.emotion_tag,
                audience: typeof updatedRaw.audience === "string" || updatedRaw.audience === null ? updatedRaw.audience as string | null : prev.audience,
              }
            : prev,
        );
        setDrawerMode("detail");
        feedbackToast.success("修改成功");
        if (onSubTopicUpdated && subTopicInfo) {
          onSubTopicUpdated({
            ...subTopicInfo,
            title: editTitle.trim(),
            hook: editHook.trim() || null,
            emotion_tag: editEmotionTag.trim() || null,
            audience: editAudience.trim() || null,
          });
        }
      } catch (error) {
        if (isTeamMembershipRequiredError(error)) setMembershipRequired(true);
        feedbackToast.error("修改失败", {
          details: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsSubmittingEdit(false);
      }
    },
    [editAudience, editEmotionTag, editHook, editTitle, onSubTopicUpdated, subTopicId, subTopicInfo],
  );

  const handleDeleteSubmit = useCallback(async () => {
    if (!subTopicId) return;
    setIsDeleting(true);
    setDeleteErrorMsg(null);
    try {
      await fetchTopicJson(`/api/topics/sub-topics/${subTopicId}`, { method: "DELETE" });
      setDrawerMode("detail");
      feedbackToast.success("已移出题库，历史作品数据完整保留");
      onSubTopicRemoved?.(subTopicId);
      handleClose();
    } catch (error) {
      if (isTeamMembershipRequiredError(error)) {
        setMembershipRequired(true);
        setDrawerMode("detail");
        return;
      }
      const status = (error as { status?: number }).status;
      if (status === 409) {
        setDeleteErrorMsg("该选题已有关联作品，移出将保留历史数据。");
        return;
      }
      feedbackToast.error("移出失败", {
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [handleClose, onSubTopicRemoved, subTopicId]);

  if (
    !subTopicId ||
    !isMounted ||
    typeof window === "undefined" ||
    !document?.body
  )
    return null;

  const isMyWriting =
    isWritingByCurrentUser ||
    subTopicInfo?.isWritingByMe === true ||
    subTopicInfo?.myClaim?.status === "writing";
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
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-5">
          {isLoading && !subTopicInfo ? (
            <div className="py-20 text-center">
              <Loader2 className="size-6 text-[#D97757] animate-spin mx-auto mb-2" />
              <p className="text-[12px] text-[#78716C]">正在加载选题详情...</p>
            </div>
          ) : membershipRequired ? (
            <Card className="p-6">
              <EmptyState
                variant="compact"
                title="请先申请加入团队"
                description="当前账号没有有效团队归属，选题详情暂不可用。"
                action={{
                  label: "关闭",
                  onClick: handleClose,
                }}
              />
            </Card>
          ) : detailError ? (
            <div className="flex items-start gap-2 rounded-md border border-[#E2E2DF]/60 bg-[#F1F1F0]/60 p-3 text-[13px] text-[#1F1E1D]">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-danger/[0.08] text-status-danger mt-0.5">
                <span className="size-1.5 rounded-full bg-current text-status-danger" />
              </span>
              <div className="space-y-0.5 min-w-0 flex-1">
                <p className="font-normal text-[#141413] text-[13px]">详情加载失败</p>
                <p className="text-[12px] text-[#78716C]">{detailError}</p>
              </div>
            </div>
          ) : (
            <>
              {/* 1. 一句话 Hook & 内容提纲 */}
              {(subTopicInfo?.hook || subTopicInfo?.outline) && (
                <section className="space-y-3">
                  {subTopicInfo?.hook && (
                    <div className="border-l-2 border-[#D97757]/60 pl-3.5 py-1 bg-gradient-to-r from-[#F1F1F0]/70 to-transparent rounded-r-xl space-y-1">
                      <div className="text-[12px] font-normal text-[#78716C] flex items-center gap-1">
                        <Sparkles className="size-3 text-[#D97757]" />
                        <span>一句话立意 Hook</span>
                      </div>
                      <p className="text-[13px] not-italic text-[#1F1E1D] leading-relaxed">
                        “{subTopicInfo.hook}”
                      </p>
                    </div>
                  )}

                  {subTopicInfo?.outline && (
                    <Card className="p-3.5 space-y-1 gap-0">
                      <div className="text-[12px] font-normal text-[#78716C] flex items-center gap-1">
                        <FileText className="size-3.5 text-[#78716C]" />
                        <span>内容提纲</span>
                      </div>
                      <p className="text-[13px] text-[#1F1E1D] leading-relaxed whitespace-pre-line font-normal">
                        {subTopicInfo.outline}
                      </p>
                    </Card>
                  )}
                </section>
              )}

              {/* 2. 历史数据双轨证明 */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionHeading as="h4" className="flex items-center gap-2">
                    <Trophy className="size-3.5 text-[#D97757]" />
                    <span>历史数据证明</span>
                  </SectionHeading>
                  <span className="text-[12px] text-[#78716C]">
                    真实数据证明 · 严禁主观推测
                  </span>
                </div>

                {/* 团队内部验证表现 */}
                <Card className="p-4 gap-3">
                  <div className="flex items-center justify-between text-[12px] border-b border-[#E2E2DF]/60 pb-2">
                    <span className="font-normal text-[#1F1E1D] flex items-center gap-1">
                      <Building2 className="size-3.5 text-status-info" />
                      <span>团队内部实测成绩</span>
                    </span>
                    <span className="text-status-success font-normal">
                      达标优质作品{" "}
                      {qualifiedCount !== null
                        ? qualifiedCount > 0
                          ? `${qualifiedCount} 条`
                          : worksTotalItems === 0
                            ? "尚无作品"
                            : "暂未达标"
                        : "—"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <Metric
                      label="最高播放"
                      value={
                        bestPlay !== null
                          ? bestPlay >= 10000
                            ? `${(bestPlay / 10000).toFixed(1)}万`
                            : bestPlay.toLocaleString()
                          : "—"
                      }
                    />
                    <Metric
                      label="平均播放"
                      value={
                        avgPlay !== null
                          ? avgPlay >= 10000
                            ? `${(avgPlay / 10000).toFixed(1)}万`
                            : avgPlay.toLocaleString()
                          : "—"
                      }
                    />
                    <Metric
                      label="优质作品数"
                      value={qualifiedCount !== null ? `${qualifiedCount} 条` : "—"}
                    />
                  </div>
                </Card>

                {/* 外部干货收集基准 (若有外部数据独立展示，绝不混合伪装) */}
                {subTopicInfo?.source_type === "external" && (
                  <div className="rounded-xl border border-status-info/20 bg-status-info/[0.08] p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-[12px] font-normal text-status-info">
                      <span className="flex items-center gap-1">
                        <Globe2 className="size-3.5" />
                        <span>外部干货收集基准</span>
                      </span>
                      <span>已验证爆款</span>
                    </div>
                    <p className="text-[13px] text-[#1F1E1D] font-normal leading-relaxed">
                      该题来源于外部优质干货样本，外部实测播放已达标。团队内完成首条创作后将自动沉淀内部专属数据。
                    </p>
                  </div>
                )}
              </section>

              {/* 3. 近 7 天参与热度 (支持多人同时写，展示进展拆解) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionHeading as="h4" className="flex items-center gap-2">
                    <Flame className="size-3.5 text-[#D97757]" />
                    <span>近 7 天参与热度</span>
                  </SectionHeading>
                  <span className="text-[12px] text-[#D97757] font-normal tabular-nums">
                    近 7 天 {total7dParticipants !== null ? `${total7dParticipants} 人参与` : "—"}
                  </span>
                </div>

                <Card className="grid grid-cols-2 gap-3 p-3.5 gap-y-0">
                  <div className="border-r border-[#E2E2DF]/60 pr-3">
                    <Metric
                      label="近 7 天已写完"
                      value={
                        completed7dCount !== null ? (
                          <span className="text-status-success">{completed7dCount} 人</span>
                        ) : (
                          "—"
                        )
                      }
                    />
                  </div>
                  <div className="pl-3">
                    <Metric
                      label="近 7 天仍在写"
                      value={
                        inProgress7dCount !== null ? (
                          <span className="text-status-info">{inProgress7dCount} 人</span>
                        ) : (
                          "—"
                        )
                      }
                    />
                  </div>
                </Card>

                {claimsError && (
                  <div className="text-[12px] text-status-danger bg-status-danger/[0.08] rounded-md p-2.5">
                    参与动态加载失败：{claimsError}
                  </div>
                )}

                {claimsData?.claims && claimsData.claims.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {claimsData.claims.map((claim) => (
                      <ListRow
                        key={claim.id}
                        className="py-1.5 px-3 bg-[#F1F1F0]/50 rounded-md border-b-0"
                      >
                        <span className="font-normal text-[#1F1E1D] text-[12px]">
                          {claim.displayName}
                        </span>
                        <Badge variant="accent">正在写</Badge>
                      </ListRow>
                    ))}
                  </div>
                )}
              </section>

              {/* 4. 历史关联作品记录 (纯数据展示，不展示原视频封面或播放器) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionHeading as="h4" className="flex items-center gap-2">
                    <FileText className="size-3.5 text-[#78716C]" />
                    <span>历史关联作品</span>
                  </SectionHeading>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md bg-[#F1F1F0] p-0.5 text-[12px]">
                      {(["best", "recent"] as WorksSort[]).map((sort) => (
                        <button
                          key={sort}
                          type="button"
                          onClick={() => void loadWorksPage(1, sort)}
                          className={`px-2 py-0.5 rounded-md transition-all cursor-pointer min-h-[44px] sm:min-h-0 flex items-center ${
                            worksQuery.sort === sort
                              ? "bg-white text-[#141413] font-normal shadow-input"
                              : "text-[#78716C] hover:text-[#141413]"
                          }`}
                        >
                          {sort === "best" ? "最高播放" : "最新发布"}
                        </button>
                      ))}
                    </div>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      共 {worksTotalItems} 条作品
                    </span>
                  </div>
                </div>

                {worksError && (
                  <div className="text-[12px] text-status-danger bg-status-danger/[0.08] rounded-md p-2.5">
                    作品加载失败：{worksError}
                  </div>
                )}

                {worksLoading ? (
                  <div className="py-8 text-center text-[12px] text-[#78716C]">
                    <Loader2 className="size-4 animate-spin mx-auto mb-2" />
                    <span>作品加载中...</span>
                  </div>
                ) : activeWorks?.items && activeWorks.items.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {activeWorks.items.map((work: TopicWorkItem) => (
                      <Card
                        key={work.id}
                        className="p-3 gap-2 hover:shadow-claude-float transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[13px] font-normal text-[#1F1E1D] line-clamp-1">
                            {work.videoTitle || work.content || "未命名作品"}
                          </div>
                          <span className="text-[12px] font-normal text-[#D97757] tabular-nums shrink-0">
                            {work.playCount !== null
                              ? work.playCount >= 10000
                                ? `${(work.playCount / 10000).toFixed(1)}万 播放`
                                : `${work.playCount.toLocaleString()} 播放`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[12px] text-[#78716C]">
                          <span>{work.displayName || "未知作者"}</span>
                          <span>{work.uploadedAt?.slice(0, 10) || "—"}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    variant="compact"
                    title="暂无关联作品"
                    description="暂无团队成员关联此选题发布视频"
                  />
                )}
              </section>
            </>
          )}
        </div>
      )}

        {/* 详情模式固定底栏 */}
        {drawerMode === "detail" && (
          <div className="shrink-0 pt-3 border-t border-[#E2E2DF] mt-auto flex items-center justify-between gap-3">
            <Link
              href={buildDashboardTopicHref(subTopicId, subTopicInfo?.title)}
              className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[#E2E2DF] bg-[#F1F1F0] hover:bg-[#EBEBE9] px-3.5 text-[12px] font-normal text-[#1F1E1D] transition-all active:scale-[0.99] active:duration-120 cursor-pointer"
            >
              <span>在工作台录入</span>
            </Link>

            <Button
              size="sm"
              onClick={() => {
                if (subTopicInfo && onGoToFeishu) {
                  onGoToFeishu(subTopicInfo);
                }
              }}
            >
              <span>{isMyWriting ? "继续创作" : "去飞书创作"}</span>
            </Button>
          </div>
        )}

        {/* 抽屉模式视图切换（单层交互 · 零嵌套弹窗） */}
        {drawerMode === "edit" ? (
          <form
            onSubmit={handleEditSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden space-y-4"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="text-[12px] font-normal text-[#78716C] block mb-1">
                  选题标题 *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-[13px] text-[#1F1E1D] rounded-md border border-[#E2E2DF] p-2.5 bg-white/50 shadow-input focus:bg-white focus:outline-none focus:border-[#141413]"
                />
                {editTitleError && (
                  <p className="text-[12px] text-status-danger mt-1">{editTitleError}</p>
                )}
              </div>

              <div>
                <label className="text-[12px] font-normal text-[#78716C] block mb-1">
                  一句话 Hook
                </label>
                <textarea
                  value={editHook}
                  onChange={(e) => setEditHook(e.target.value)}
                  rows={3}
                  className="w-full text-[13px] text-[#1F1E1D] rounded-md border border-[#E2E2DF] p-2.5 bg-white/50 shadow-input focus:bg-white focus:outline-none focus:border-[#141413]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-normal text-[#78716C] block mb-1">
                    情绪标签
                  </label>
                  <input
                    type="text"
                    value={editEmotionTag}
                    onChange={(e) => setEditEmotionTag(e.target.value)}
                    className="w-full text-[13px] text-[#1F1E1D] rounded-md border border-[#E2E2DF] p-2.5 bg-white/50 shadow-input focus:bg-white focus:outline-none focus:border-[#141413]"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-normal text-[#78716C] block mb-1">
                    目标受众
                  </label>
                  <input
                    type="text"
                    value={editAudience}
                    onChange={(e) => setEditAudience(e.target.value)}
                    className="w-full text-[13px] text-[#1F1E1D] rounded-md border border-[#E2E2DF] p-2.5 bg-white/50 shadow-input focus:bg-white focus:outline-none focus:border-[#141413]"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[#E2E2DF] pt-3 flex justify-end gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="m"
                onClick={() => setDrawerMode("detail")}
              >
                取消
              </Button>
              <Button type="submit" size="m" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? "保存中..." : "保存修改"}
              </Button>
            </div>
          </form>
        ) : drawerMode === "confirm_delete" ? (
          <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
            <Card variant="cushion" className="space-y-3 p-4 gap-0">
              <div className="flex items-center gap-2 text-status-danger font-normal text-[14px]">
                <AlertTriangle className="size-4" />
                <span>确认移出干货选题库？</span>
              </div>
              <p className="leading-relaxed">
                移出后该选题将停止在员工选题库中展示，但历史作品数据与复盘关联完整保留。
              </p>
              {deleteErrorMsg && (
                <p className="text-[12px] text-status-danger font-normal">{deleteErrorMsg}</p>
              )}
            </Card>

            <div className="border-t border-[#E2E2DF] pt-3 flex justify-end gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="m"
                onClick={() => setDrawerMode("detail")}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="m"
                disabled={isDeleting}
                onClick={() => void handleDeleteSubmit()}
              >
                {isDeleting ? "移出中..." : "确认移出"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
