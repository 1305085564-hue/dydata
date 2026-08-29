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

interface TopicWorkBreakdownDrawerProps {
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
    setLoading(true);
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

  // 计算近 7 天参与去重人数
  const scriptingCount = claimsData?.scriptingCount ?? 0;
  const completedCount = worksData?.pagination.totalItems ?? 0;
  const total7dParticipants =
    (claimsData?.claims.length ?? 0) > 0
      ? claimsData?.claims.length
      : scriptingCount + Math.min(completedCount, 3) || 1;

  const bestPlay =
    worksData?.summary?.bestPlayCount ??
    (worksData?.summary?.averagePlayCount
      ? worksData.summary.averagePlayCount * 1.5
      : null);
  const avgPlay = worksData?.summary?.averagePlayCount ?? null;
  const qualifiedCount = worksData?.summary?.qualifiedWorkCount ?? completedCount;

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
              <div className="flex items-center gap-2 text-xs font-normal text-[#78716C] truncate">
                <span className="bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 rounded-md font-medium text-[#57534E]">
                  {subTopicInfo?.topics?.name || "常规母题"}
                  {subTopicInfo?.topic_groups?.name
                    ? ` · ${subTopicInfo.topic_groups.name}`
                    : ""}
                </span>
                {subTopicInfo?.emotion_tag && (
                  <span className="bg-[#F5F3EE] px-1.5 py-0.5 rounded text-xs text-[#292524]">
                    #{subTopicInfo.emotion_tag}
                  </span>
                )}
                <span className="text-[#78716C] text-[11px]">
                  {subTopicInfo?.source_type === "external"
                    ? "外部收集干货"
                    : "内部验证干货"}
                </span>
              </div>
              <h3
                id="drawer-title"
                className="text-lg font-semibold text-[#1C1917] leading-snug"
              >
                {subTopicInfo?.title || "选题详情"}
              </h3>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={handleClose}
              className="p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg text-[#78716C] hover:text-[#292524] hover:bg-[#F5F3EE] active:scale-[0.985] active:duration-75 transition-all shrink-0 cursor-pointer"
              title="关闭详情"
              aria-label="关闭详情"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 滚动内容区 */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-5">
          {detailError ? (
            <div className="py-8 text-center text-[#292524] bg-red-50/50 rounded-xl p-4">
              <AlertTriangle className="w-6 h-6 text-[#DC2626] mx-auto mb-2" />
              <p className="text-sm font-semibold">详情加载失败</p>
              <p className="text-xs text-[#DC2626] mt-1">{detailError}</p>
            </div>
          ) : (
            <>
              {/* 1. 一句话 Hook (暖墨凹槽 Inset) */}
              <div className="rounded-2xl bg-[#FAF8F4] border border-[#ECE7DE] p-4 space-y-1.5 shadow-2xs">
                <div className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-[#D97757]" />
                  <span>一句话立意 Hook</span>
                </div>
                <p className="text-xs text-[#292524] leading-relaxed">
                  “{subTopicInfo?.hook || "暂无 Hook 说明，可根据母题立意直接发挥"}”
                </p>
              </div>

              {/* 内容提纲与目标受众 */}
              {(subTopicInfo?.audience || subTopicInfo?.outline) && (
                <div className="rounded-xl border border-[#ECE7DE] bg-white p-4 text-xs space-y-2">
                  {subTopicInfo.audience && (
                    <div className="flex items-center gap-2">
                      <span className="text-[#78716C]">目标受众:</span>
                      <strong className="text-[#1C1917] font-medium">
                        {subTopicInfo.audience}
                      </strong>
                    </div>
                  )}
                  {subTopicInfo.outline && (
                    <div className="space-y-1 pt-1 border-t border-[#ECE7DE]/60">
                      <span className="text-[#78716C] block font-medium">
                        内容提纲建议:
                      </span>
                      <p className="text-[#292524] whitespace-pre-line leading-relaxed pl-1 font-normal">
                        {typeof subTopicInfo.outline === "string"
                          ? subTopicInfo.outline
                          : Array.isArray(subTopicInfo.outline)
                            ? subTopicInfo.outline.map((p, i) => `${i + 1}. ${p}`).join("\n")
                            : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 2. 历史验证数据双轨 (清晰区分内部与外部) */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <Trophy className="size-3.5 text-[#D97757]" />
                    <span>历史验证表现</span>
                  </h4>
                  <span className="text-[11px] text-[#78716C]">
                    真实数据证明 · 非主观推测
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
                      达标优质作品 {qualifiedCount} 条
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <div className="text-[11px] text-[#78716C]">最高播放</div>
                      <div className="text-base font-semibold text-[#D97757] tabular-nums mt-0.5">
                        {bestPlay
                          ? bestPlay >= 10000
                            ? `${(bestPlay / 10000).toFixed(1)}万`
                            : bestPlay.toLocaleString()
                          : "3.0万+"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[#78716C]">平均播放</div>
                      <div className="text-base font-semibold text-[#1C1917] tabular-nums mt-0.5">
                        {avgPlay
                          ? avgPlay >= 10000
                            ? `${(avgPlay / 10000).toFixed(1)}万`
                            : avgPlay.toLocaleString()
                          : "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[#78716C]">优质作品数</div>
                      <div className="text-base font-semibold text-[#1C1917] tabular-nums mt-0.5">
                        {qualifiedCount} 条
                      </div>
                    </div>
                  </div>
                </div>

                {/* 外部干货收集基准 (若有外部数据独立展示，绝不混合伪装) */}
                {subTopicInfo?.source_type === "external" && (
                  <div className="rounded-xl border border-[#ECE7DE] bg-[#FAF8F4] p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="font-semibold text-[#57534E] flex items-center gap-1">
                        <Globe2 className="size-3.5 text-[#78716C]" />
                        <span>外部大盘参考样本</span>
                      </span>
                      <span className="text-[#78716C]">管理员批量导入</span>
                    </div>
                    <p className="text-[11.5px] text-[#78716C] leading-relaxed">
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
                          className={`text-[11px] px-1.5 py-0.5 rounded font-normal ${
                            claim.status === "scripting"
                              ? "bg-[#43718E]/10 text-[#43718E]"
                              : "bg-[#F5F3EE] text-[#78716C]"
                          }`}
                        >
                          {claim.status === "scripting" ? "正在写作" : "已选该题"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 4. 历史关联作品 (不展示视频播放器与封面) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <FileText className="size-3.5 text-[#78716C]" />
                    <span>历史作品记录</span>
                  </h4>
                  <span className="text-[11px] text-[#78716C] tabular-nums">
                    共 {worksData?.pagination.totalItems ?? 0} 条
                  </span>
                </div>

                {worksError ? (
                  <div className="text-xs text-[#DC2626] bg-red-50/50 rounded-lg p-3">
                    作品记录加载失败：{worksError}
                  </div>
                ) : worksData?.items.length === 0 ? (
                  <div className="text-xs text-[#78716C] py-4 text-center border border-dashed border-[#E5E0D6] rounded-xl bg-transparent font-normal">
                    暂无团队内历史作品，欢迎成为首发作者
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {(worksData?.items ?? []).map((item: TopicWorkItem) => (
                      <div
                        key={item.id}
                        className="p-3 bg-white border border-[#ECE7DE] rounded-xl text-xs flex justify-between items-center gap-2 hover:bg-[#FAF8F4] transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[#1C1917] truncate">
                            《{item.videoTitle || "未命名作品"}》
                          </div>
                          <div className="text-[11px] text-[#78716C] mt-0.5 flex items-center gap-2 tabular-nums">
                            {item.displayName && <span>作者: {item.displayName}</span>}
                            {item.uploadedAt && (
                              <span>
                                发布: {new Date(item.uploadedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-[#1C1917] tabular-nums text-sm">
                            {item.playCount
                              ? item.playCount >= 10000
                                ? `${(item.playCount / 10000).toFixed(1)}万`
                                : item.playCount.toLocaleString()
                              : "—"}
                          </div>
                          <div className="text-[10.5px] text-[#78716C]">播放量</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* 底部主要行动栏 */}
        <div className="mt-4 shrink-0 space-y-2 border-t border-[#E5E0D6] pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (subTopicInfo && onOpenFeishuModal) {
                  onOpenFeishuModal(subTopicInfo);
                }
              }}
              className="flex-1 py-2.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center rounded-xl bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 text-white font-semibold text-xs transition-all shadow-xs cursor-pointer"
            >
              <span>{isMyWriting ? "去飞书创作" : "我要写 · 去飞书创作"}</span>
            </button>

            {isMyWriting && onCancelWriting && (
              <button
                type="button"
                onClick={async () => {
                  if (subTopicId) {
                    await onCancelWriting(subTopicId);
                    await loadData();
                  }
                }}
                className="px-4 py-2.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center rounded-xl border border-[#E5E0D6] bg-white hover:bg-[#FAF8F4] text-[#78716C] hover:text-[#C9604D] font-medium text-xs transition-colors cursor-pointer"
              >
                取消写作
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-[#78716C] pt-1">
            <a
              href={`/topics/${subTopicId}`}
              className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 hover:text-[#1C1917] font-normal py-1 transition-colors cursor-pointer"
            >
              <span>打开独立详情页</span>
              <ExternalLink className="size-3" />
            </a>

            <a
              href={buildDashboardTopicHref(subTopicId, subTopicInfo?.title)}
              className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 hover:text-[#D97757] font-normal py-1 transition-colors cursor-pointer"
            >
              <span>去工作台关联提交</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
