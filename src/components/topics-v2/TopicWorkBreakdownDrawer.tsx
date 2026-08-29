"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ExternalLink,
  AlertTriangle,
  FileText,
  Sparkles,
  Flame,
  Trophy,
  Building2,
  Globe2,
  Loader2,
} from "lucide-react";
import {
  fetchTopicJson,
  parseClaimsResponse,
  parseSubTopicDetailResponse,
  parseTopicWorksResponse,
} from "@/lib/topics/v2-client-contract";
import { buildDashboardTopicHref } from "@/lib/topics/dashboard-context";
import type {
  TopicClaimsDetailResponse,
  TopicWorkItem,
  TopicWorksResponse,
  SubTopicItem,
} from "./types";

const emptySubscribe = () => () => {};

export interface TopicWorkBreakdownDrawerProps {
  subTopicId: string | null;
  onClose: () => void;
  onOpenFeishuModal?: (topic: SubTopicItem) => void;
  onMarkWriting?: (subTopicId: string) => Promise<void>;
  onCancelWriting?: (subTopicId: string) => Promise<void>;
}

export function TopicWorkBreakdownDrawer({
  subTopicId,
  onClose,
  onOpenFeishuModal,
  onCancelWriting,
}: TopicWorkBreakdownDrawerProps) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [subTopicInfo, setSubTopicInfo] = useState<SubTopicItem | null>(null);
  const [worksData, setWorksData] = useState<TopicWorksResponse | null>(null);
  const [claimsData, setClaimsData] =
    useState<TopicClaimsDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [worksError, setWorksError] = useState<string | null>(null);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

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
  }, [subTopicId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && subTopicId) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [subTopicId, handleClose]);

  const loadData = useCallback(async () => {
    if (!subTopicId) return;
    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setSubTopicInfo(null);
    setWorksData(null);
    setClaimsData(null);
    setDetailError(null);
    setWorksError(null);
    setClaimsError(null);

    const [detailResult, worksResult, claimsResult] = await Promise.allSettled([
      fetchTopicJson(`/api/topics/sub-topics/${subTopicId}`),
      fetchTopicJson(
        `/api/topics/sub-topics/${subTopicId}/works?sort=best&page=1&page_size=20`,
      ),
      fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/claims`),
    ]);

    if (requestId !== loadRequestId.current) return;

    if (detailResult.status === "fulfilled") {
      try {
        setSubTopicInfo(
          parseSubTopicDetailResponse(detailResult.value)
            .subTopic as SubTopicItem,
        );
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

    if (worksResult.status === "fulfilled") {
      try {
        setWorksData(
          parseTopicWorksResponse(worksResult.value) as TopicWorksResponse,
        );
      } catch (error) {
        setWorksError(error instanceof Error ? error.message : "作品结构无效");
      }
    } else {
      setWorksError(
        worksResult.reason instanceof Error
          ? worksResult.reason.message
          : "作品加载失败",
      );
    }

    if (claimsResult.status === "fulfilled") {
      try {
        const parsed = parseClaimsResponse(claimsResult.value);
        setClaimsData({
          candidateCount: parsed.candidateCount,
          scriptingCount: parsed.scriptingCount,
          claims: parsed.claims.map((claim) => ({
            id: claim.id ?? `${claim.userId}:${claim.status}`,
            userId: claim.userId,
            displayName: claim.displayName,
            status: claim.status,
            claimedAt: claim.claimedAt,
          })),
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
  }, [subTopicId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (subTopicId) void loadData();
  }, [loadData, subTopicId]);

  if (
    !subTopicId ||
    !isMounted ||
    typeof window === "undefined" ||
    !document?.body
  )
    return null;

  const isMyWriting =
    subTopicInfo?.myClaim?.status === "candidate" ||
    subTopicInfo?.myClaim?.status === "scripting";

  // 计算近 7 天参与去重人数（有真实值才计算，杜绝猜数或补造数据）
  const scriptingCount = claimsData?.scriptingCount ?? 0;
  const completedCount = worksData?.pagination.totalItems ?? 0;
  const total7dParticipants =
    claimsData?.claims && claimsData.claims.length > 0
      ? claimsData.claims.length
      : scriptingCount > 0
        ? scriptingCount
        : 0;

  // 历史指标严格读取真实字段，不存在则统一显示 null / "—"
  const bestPlay = worksData?.summary?.bestPlayCount ?? null;
  const avgPlay = worksData?.summary?.averagePlayCount ?? null;
  const qualifiedCount = worksData?.summary?.qualifiedWorkCount ?? null;

  return createPortal(
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-[#1C1917]/20 backdrop-blur-xs z-[75] transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* 抽屉主体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed top-[var(--app-top-offset,64px)] bottom-0 right-0 z-[80] flex min-h-0 max-h-[calc(100dvh-var(--app-top-offset,64px))] w-full max-w-xl flex-col overflow-hidden border-l border-[#E5E0D6] bg-[#FBF9F5]/95 p-6 shadow-claude-dialog backdrop-blur-xl animate-in slide-in-from-right duration-200"
      >
        {/* 顶部标题栏 */}
        <div className="shrink-0">
          <div className="flex items-start justify-between pb-3.5 border-b border-[#ECE7DE] mb-4 pt-1">
            <div className="min-w-0 pr-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#78716C] bg-[#F5F3EE] px-2 py-0.5 rounded-md">
                  {subTopicInfo?.topics?.name || "干货选题"}
                </span>
                {subTopicInfo?.source_type === "external" && (
                  <span className="text-xs text-[#43718E] bg-[#43718E]/10 px-2 py-0.5 rounded-md font-medium">
                    外部收集干货
                  </span>
                )}
              </div>
              <h3
                id="drawer-title"
                className="text-lg font-semibold text-[#1C1917] leading-snug line-clamp-2"
              >
                {subTopicInfo?.title || "选题详情"}
              </h3>
            </div>
            <button
              ref={closeBtnRef}
              onClick={handleClose}
              className="rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              aria-label="关闭抽屉"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* 抽屉滚动内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-5">
          {isLoading ? (
            <div className="py-20 text-center">
              <Loader2 className="size-6 text-[#D97757] animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#78716C]">正在加载选题详情...</p>
            </div>
          ) : detailError ? (
            <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 p-4 text-xs text-[#DC2626] space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="size-4" />
                <span>详情加载失败</span>
              </div>
              <p className="text-[#78716C]">{detailError}</p>
            </div>
          ) : (
            <>
              {/* 1. 一句话 Hook & 内容提纲 */}
              {(subTopicInfo?.hook || subTopicInfo?.outline) && (
                <section className="space-y-3">
                  {subTopicInfo?.hook && (
                    <div className="rounded-xl border border-[#D97757]/20 bg-[#FAF8F4] p-3.5 space-y-1">
                      <div className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-[#D97757]" />
                        <span>一句话立意 Hook</span>
                      </div>
                      <p className="text-xs text-[#292524] leading-relaxed">
                        “{subTopicInfo.hook}”
                      </p>
                    </div>
                  )}

                  {subTopicInfo?.outline && (
                    <div className="rounded-xl border border-[#ECE7DE] bg-white p-3.5 space-y-1.5">
                      <div className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                        <FileText className="size-3.5 text-[#78716C]" />
                        <span>内容提纲</span>
                      </div>
                      <p className="text-xs text-[#57534E] leading-relaxed whitespace-pre-line font-normal">
                        {subTopicInfo.outline}
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* 2. 历史数据双轨证明 */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <Trophy className="size-3.5 text-[#D97757]" />
                    <span>历史数据证明</span>
                  </h4>
                  <span className="text-[11px] text-[#78716C]">
                    真实数据证明 · 严禁主观推测
                  </span>
                </div>

                {/* 团队内部验证表现 */}
                <div className="rounded-2xl border border-[#ECE7DE] bg-white p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between text-xs border-b border-[#ECE7DE]/60 pb-2">
                    <span className="font-semibold text-[#1C1917] flex items-center gap-1.5">
                      <Building2 className="size-3.5 text-[#43718E]" />
                      <span>团队内部实测成绩</span>
                    </span>
                    <span className="text-[#6FAA7D] font-medium">
                      达标优质作品 {qualifiedCount !== null ? `${qualifiedCount} 条` : "—"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <div className="text-[11px] text-[#78716C]">最高播放</div>
                      <div className="text-base font-semibold text-[#D97757] tabular-nums mt-0.5">
                        {bestPlay !== null
                          ? bestPlay >= 10000
                            ? `${(bestPlay / 10000).toFixed(1)}万`
                            : bestPlay.toLocaleString()
                          : "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[#78716C]">平均播放</div>
                      <div className="text-base font-semibold text-[#1C1917] tabular-nums mt-0.5">
                        {avgPlay !== null
                          ? avgPlay >= 10000
                            ? `${(avgPlay / 10000).toFixed(1)}万`
                            : avgPlay.toLocaleString()
                          : "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[#78716C]">优质作品数</div>
                      <div className="text-base font-semibold text-[#1C1917] tabular-nums mt-0.5">
                        {qualifiedCount !== null ? `${qualifiedCount} 条` : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 外部干货收集基准 (若有外部数据独立展示，绝不混合伪装) */}
                {subTopicInfo?.source_type === "external" && (
                  <div className="rounded-2xl border border-[#43718E]/20 bg-[#43718E]/5 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#43718E]">
                      <span className="flex items-center gap-1.5">
                        <Globe2 className="size-3.5" />
                        <span>外部干货收集基准</span>
                      </span>
                      <span>已验证爆款</span>
                    </div>
                    <p className="text-xs text-[#78716C] leading-relaxed">
                      该题来源于外部优质干货样本，外部实测播放已达标。团队内完成首条创作后将自动沉淀内部专属数据。
                    </p>
                  </div>
                )}
              </section>

              {/* 3. 近 7 天参与热度 (支持多人同时写，展示进展拆解) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <Flame className="size-3.5 text-[#D97757]" />
                    <span>近 7 天参与热度</span>
                  </h4>
                  <span className="text-xs text-[#D97757] font-semibold tabular-nums">
                    近 7 天 {total7dParticipants} 人参与
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#ECE7DE] bg-white p-3.5 text-xs text-center">
                  <div className="border-r border-[#ECE7DE]">
                    <div className="text-[11px] text-[#78716C]">已写完成片</div>
                    <div className="text-base font-semibold text-[#6FAA7D] tabular-nums mt-0.5">
                      {completedCount} 人
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#78716C]">当前仍在写</div>
                    <div className="text-base font-semibold text-[#43718E] tabular-nums mt-0.5">
                      {scriptingCount} 人
                    </div>
                  </div>
                </div>

                {claimsError && (
                  <div className="text-xs text-[#DC2626] bg-red-50/50 rounded-lg p-2.5">
                    参与动态加载失败：{claimsError}
                  </div>
                )}

                {claimsData?.claims && claimsData.claims.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {claimsData.claims.map((claim) => (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between rounded-lg bg-[#FAF8F4] px-3 py-1.5 text-xs"
                      >
                        <span className="font-medium text-[#292524]">
                          {claim.displayName}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            claim.status === "scripting"
                              ? "bg-[#43718E]/10 text-[#43718E]"
                              : "bg-[#F5F3EE] text-[#78716C]"
                          }`}
                        >
                          {claim.status === "scripting"
                            ? "正在飞书写作"
                            : "已选该题"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 4. 历史关联作品记录 (纯数据展示，不展示原视频封面或播放器) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <FileText className="size-3.5 text-[#78716C]" />
                    <span>历史关联作品</span>
                  </h4>
                  <span className="text-xs text-[#78716C] tabular-nums">
                    共 {worksData?.pagination.totalItems ?? 0} 条作品
                  </span>
                </div>

                {worksError ? (
                  <div className="rounded-xl border border-[#DC2626]/20 bg-[#DC2626]/5 p-3 text-xs text-[#DC2626]">
                    作品列表加载失败：{worksError}
                  </div>
                ) : worksData?.items && worksData.items.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {worksData.items.map((work: TopicWorkItem) => (
                      <div
                        key={work.id}
                        className="rounded-xl border border-[#ECE7DE] bg-white p-3 space-y-1.5 shadow-2xs hover:border-[#D97757]/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold text-[#1C1917] line-clamp-1">
                            {work.videoTitle || work.content || "未命名作品"}
                          </div>
                          <span className="text-xs font-semibold text-[#D97757] tabular-nums shrink-0">
                            {work.playCount !== null
                              ? work.playCount >= 10000
                                ? `${(work.playCount / 10000).toFixed(1)}万 播放`
                                : `${work.playCount.toLocaleString()} 播放`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#78716C]">
                          <span>{work.displayName || "未知作者"}</span>
                          <span>{work.uploadedAt?.slice(0, 10) || "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#ECE7DE] p-6 text-center text-xs text-[#78716C]">
                    暂无关联作品记录
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* 底栏固定主行动：去飞书创作 */}
        <div className="shrink-0 border-t border-[#E5E0D6] pt-4 mt-2 bg-[#FBF9F5] flex items-center justify-between gap-3">
          <a
            href={buildDashboardTopicHref(subTopicId, subTopicInfo?.title)}
            className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 text-xs text-[#78716C] hover:text-[#1C1917] transition-colors"
          >
            <span>打开独立详情页</span>
            <ExternalLink className="size-3" />
          </a>

          <div className="flex items-center gap-2">
            {isMyWriting && onCancelWriting && (
              <button
                type="button"
                onClick={() => onCancelWriting(subTopicId)}
                className="inline-flex min-h-[44px] sm:min-h-0 items-center justify-center rounded-xl border border-[#ECE7DE] bg-white px-3 py-2 text-xs font-medium text-[#78716C] hover:bg-[#FAF8F4] hover:text-[#DC2626] transition-colors cursor-pointer"
              >
                取消写作
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (subTopicInfo && onOpenFeishuModal) {
                  onOpenFeishuModal({
                    id: subTopicInfo.id,
                    title: subTopicInfo.title,
                    hook: subTopicInfo.hook,
                    outline: subTopicInfo.outline,
                    topic_id: subTopicInfo.topic_id,
                    topics: subTopicInfo.topics,
                    source_type: subTopicInfo.source_type,
                  } as unknown as SubTopicItem);
                }
              }}
              className="inline-flex min-h-[44px] sm:min-h-0 items-center justify-center gap-1.5 rounded-xl bg-[#D97757] px-5 py-2 text-xs font-semibold text-white hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 shadow-2xs transition-all cursor-pointer"
            >
              <span>{isMyWriting ? "去飞书创作" : "我要写（去飞书）"}</span>
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
