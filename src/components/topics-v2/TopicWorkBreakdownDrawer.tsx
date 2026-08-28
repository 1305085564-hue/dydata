"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ExternalLink,
  AlertTriangle,
  FileText,
  Video,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import {
  fetchTopicJson,
  getTopicActionState,
  parseClaimsResponse,
  parseSubTopicDetailResponse,
  parseTopicWorksResponse,
} from "@/lib/topics/v2-client-contract";
import type {
  TopicClaimsDetailResponse,
  TopicWorkItem,
  TopicWorksResponse,
  SubTopicItem,
} from "./types";
import { buildDashboardTopicHref } from "@/lib/topics/dashboard-context";

interface TopicWorkBreakdownDrawerProps {
  subTopicId: string | null;
  onClose: () => void;
  onClaim: (subTopicId: string) => Promise<void>;
  onStartScripting: (subTopicId: string) => Promise<void>;
  onReturnClaim: (subTopicId: string) => Promise<void>;
}

export function TopicWorkBreakdownDrawer({
  subTopicId,
  onClose,
  onClaim,
  onStartScripting,
  onReturnClaim,
}: TopicWorkBreakdownDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [subTopicInfo, setSubTopicInfo] = useState<SubTopicItem | null>(null);
  const [worksData, setWorksData] = useState<TopicWorksResponse | null>(null);
  const [claimsData, setClaimsData] =
    useState<TopicClaimsDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [worksError, setWorksError] = useState<string | null>(null);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loadRequestId = useRef(0);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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
          error instanceof Error ? error.message : "撞车动态结构无效",
        );
      }
    } else {
      setClaimsError(
        claimsResult.reason instanceof Error
          ? claimsResult.reason.message
          : "撞车动态加载失败",
      );
    }
    setLoading(false);
  }, [subTopicId]);

  useEffect(() => {
    if (subTopicId) void loadData();
  }, [loadData, subTopicId]);

  if (
    !subTopicId ||
    !mounted ||
    typeof window === "undefined" ||
    !document?.body
  )
    return null;

  const claim =
    subTopicInfo?.myClaim &&
    (subTopicInfo.myClaim.status === "candidate" ||
      subTopicInfo.myClaim.status === "scripting")
      ? subTopicInfo.myClaim
      : null;
  const action = getTopicActionState(
    detailError
      ? null
      : claim
        ? {
            id: claim.id,
            subTopicId: claim.subTopicId,
            status: claim.status === "candidate" ? "candidate" : "scripting",
            claimedAt: claim.claimedAt,
          }
        : null,
  );

  const handleAction = async () => {
    if (
      !(action.canClaim || action.canStartScripting || action.canReturn) ||
      submitting
    )
      return;
    try {
      setSubmitting(true);
      if (action.canClaim) {
        await onClaim(subTopicId);
      } else if (action.canStartScripting) {
        await onStartScripting(subTopicId);
      } else if (action.canReturn) {
        await onReturnClaim(subTopicId);
      }
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <>
      {/* 遮罩：z-[75] 脱离局部 context 提升到最高 body */}
      <div
        className="fixed inset-0 bg-[#1C1917]/20 backdrop-blur-xs z-[75] transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />
      {/* 抽屉面板：z-[80] 并通过 top-[var(--app-top-offset,64px)] 完美避开顶栏导航遮挡 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed top-[var(--app-top-offset,64px)] bottom-0 right-0 z-[80] flex min-h-0 max-h-[calc(100dvh-var(--app-top-offset,64px))] w-full max-w-xl flex-col overflow-hidden border-l border-[#E5E0D6] bg-[#FBF9F5]/95 p-6 shadow-claude-dialog backdrop-blur-xl animate-in slide-in-from-right duration-200"
      >
        <div className="shrink-0">
          <div className="flex items-start justify-between pb-4 border-b border-[#ECE7DE] mb-4 pt-1">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-2 text-xs font-normal text-[#78716C] mb-1 truncate">
                <span>{subTopicInfo?.topics?.name || "常规母题"}</span>
                {subTopicInfo?.topic_groups?.name && (
                  <span>· {subTopicInfo.topic_groups.name}</span>
                )}
                {subTopicInfo?.emotion_tag && (
                  <span className="bg-[#F5F3EE] px-1.5 py-0.5 rounded text-xs text-[#292524] font-normal">
                    #{subTopicInfo.emotion_tag}
                  </span>
                )}
              </div>
              <h3
                id="drawer-title"
                className="text-lg font-semibold text-[#1C1917] leading-snug"
              >
                {subTopicInfo?.title || "子题详情"}
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

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {detailError ? (
            <div className="py-8 text-center text-[#292524] bg-red-50/50 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-[#DC2626] mx-auto mb-2" />
              <p className="text-sm font-medium">详情加载失败</p>
              <p className="text-xs text-[#DC2626] mt-1 font-normal">
                {detailError}
              </p>
            </div>
          ) : (
            <div className="bg-[#FBF9F5]/80 rounded-2xl p-4 mb-6 border-0">
              <div className="text-xs font-medium text-[#78716C] mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-[#78716C]" />
                <span>一句话选题 Hook</span>
              </div>
              <p className="not-italic text-sm text-[#292524] leading-relaxed">
                “{subTopicInfo?.hook || "还没有 Hook"}”
              </p>
            </div>
          )}

          {loading && !subTopicInfo ? (
            <div className="py-12 text-center text-xs text-[#78716C] font-normal">
              <RefreshCw className="w-4 h-4 text-[#78716C] animate-spin mx-auto mb-2" />
              <span>详情加载中...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 撞车动态 */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-[#292524] flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#78716C]" />
                    <span>撞车动态</span>
                  </h4>
                  {claimsData && (
                    <span className="text-xs text-[#78716C] font-normal tabular-nums">
                      候选 {claimsData.candidateCount} · 脚本中{" "}
                      {claimsData.scriptingCount}
                    </span>
                  )}
                </div>
                {claimsError ? (
                  <div className="text-xs text-[#292524] bg-red-50/50 rounded-lg p-3 font-normal">
                    {claimsError}
                  </div>
                ) : claimsData?.claims.length === 0 ? (
                  <div className="text-xs text-[#78716C] py-4 text-center rounded-xl bg-[#F5F3EE]/50 font-normal">
                    还没有团队成员认领
                  </div>
                ) : (
                  claimsData && (
                    <div className="space-y-1.5">
                      {claimsData.claims.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between bg-[#FBF9F5]/80 px-3 py-2 rounded-xl border-0 text-xs"
                        >
                          <span className="font-medium text-[#292524]">
                            {item.displayName}
                          </span>
                          <span
                            className={
                              item.status === "scripting"
                                ? "bg-[#E5E0D6]/70 text-[#292524] font-medium px-2 py-0.5 rounded-md text-xs"
                                : "bg-[#E5E0D6]/50 text-[#292524] font-normal px-2 py-0.5 rounded-md text-xs"
                            }
                          >
                            {item.status === "scripting"
                              ? "脚本撰写中"
                              : "候选准备"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </section>

              {/* 作品数据汇总 */}
              {worksError ? (
                <div className="text-xs text-[#292524] bg-red-50/50 rounded-lg p-3 font-normal">
                  作品加载失败：{worksError}
                </div>
              ) : (
                worksData?.summary && (
                  <section>
                    <h4 className="text-xs font-medium text-[#292524] mb-2 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-[#78716C]" />
                      <span>合格作品数据汇总</span>
                    </h4>
                    <div className="grid grid-cols-3 gap-3 bg-[#FBF9F5]/80 rounded-2xl p-4 border-0 text-center text-xs">
                      <Metric
                        label="合格作品数"
                        value={String(worksData.summary.qualifiedWorkCount)}
                      />
                      <Metric
                        label="平均播放量"
                        value={formatPlayCount(
                          worksData.summary.averagePlayCount,
                        )}
                      />
                      <Metric
                        label="最高播放"
                        value={formatPlayCount(worksData.summary.bestPlayCount)}
                        accent
                      />
                    </div>
                  </section>
                )
              )}

              {/* 最高播放文案摘录 */}
              {worksData?.summary?.bestCopy && (
                <section className="bg-[#FBF9F5]/80 rounded-2xl p-4 text-xs border-0">
                  <div className="text-xs font-medium text-[#78716C] mb-1.5">
                    最高播放作品文案摘录
                  </div>
                  <p className="text-[#292524] line-clamp-4 leading-relaxed bg-white p-3 rounded-xl border border-[#ECE7DE] font-normal shadow-2xs">
                    {worksData.summary.bestCopy}
                  </p>
                </section>
              )}

              {/* 历史关联作品 */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-[#292524]">
                    历史关联作品
                  </h4>
                  <span className="text-xs text-[#78716C] font-normal tabular-nums">
                    {worksData?.pagination.totalItems ?? 0} 条
                  </span>
                </div>
                {worksData?.items.length === 0 ? (
                  <div className="text-xs text-[#78716C] py-4 text-center border border-dashed border-[#E5E0D6] rounded-xl bg-[#FBF9F5]/50 font-normal">
                    还没有已上线的成片作品
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {(worksData?.items ?? []).map((item: TopicWorkItem) => (
                      <div
                        key={item.id}
                        className="p-3 bg-[#FBF9F5]/70 hover:bg-[#F5F3EE]/60 rounded-xl text-xs flex justify-between items-start gap-2 border-0 transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-[#1C1917] line-clamp-1">
                            《{item.videoTitle}》
                          </div>
                          {item.uploadedAt && (
                            <div className="text-[11px] text-[#78716C] mt-0.5 font-normal tabular-nums">
                              发布时间:{" "}
                              {new Date(item.uploadedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-[#1C1917] tabular-nums text-sm">
                            {formatPlayCount(item.playCount)}
                          </div>
                          <div className="text-[11px] text-[#78716C] font-normal">
                            播放量
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="mt-6 shrink-0 space-y-2 border-t border-[#E5E0D6] pt-4">
          <div className="flex items-center gap-2">
            {!action.canClaim && action.label === "脚本中" ? (
              <a
                href={buildDashboardTopicHref(subTopicId, subTopicInfo?.title)}
                className="flex-1 py-2.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center text-center rounded-lg bg-[#D97757] hover:bg-[#C46A4D] text-white font-medium text-xs transition-all shadow-xs cursor-pointer"
              >
                去工作台立卷
              </a>
            ) : action.canStartScripting ? (
              <button
                type="button"
                onClick={() => void handleAction()}
                disabled={submitting}
                className="flex-1 py-2.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                开始写脚本
              </button>
            ) : action.canClaim ? (
              <button
                type="button"
                onClick={() => void handleAction()}
                disabled={submitting}
                className="flex-1 py-2.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                认领到候选
              </button>
            ) : null}
            {action.canReturn && (
              <button
                type="button"
                onClick={() => void handleAction()}
                disabled={submitting}
                className="px-4 py-2.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center rounded-lg border border-[#E5E0D6] bg-white hover:bg-[#FBF9F5] active:scale-[0.985] active:duration-75 text-[#292524] font-medium text-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                放回
              </button>
            )}
          </div>
          <a
            href={`/topics/${subTopicId}`}
            className="inline-flex min-h-[44px] sm:min-h-0 items-center justify-center gap-1 w-full text-center text-xs text-[#D97757] hover:text-[#C46A4D] font-medium py-2 transition-colors cursor-pointer"
          >
            <span>查看完整详情页</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </>,
    document.body,
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#78716C] font-normal">{label}</div>
      <div
        className={`font-semibold text-base sm:text-lg mt-0.5 tabular-nums ${accent ? "text-[#D97757]" : "text-[#1C1917]"}`}
      >
        {value}
      </div>
    </div>
  );
}

function formatPlayCount(value: number | null) {
  if (value === null) return "—";
  return value >= 10000
    ? `${(value / 10000).toFixed(1)}万`
    : value.toLocaleString();
}
