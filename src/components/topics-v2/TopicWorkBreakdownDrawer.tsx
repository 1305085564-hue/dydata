"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import type { TopicClaimsDetailResponse, TopicWorkItem, TopicWorksResponse, SubTopicItem } from "./types";

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
  const [subTopicInfo, setSubTopicInfo] = useState<SubTopicItem | null>(null);
  const [worksData, setWorksData] = useState<TopicWorksResponse | null>(null);
  const [claimsData, setClaimsData] = useState<TopicClaimsDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [worksError, setWorksError] = useState<string | null>(null);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loadRequestId = useRef(0);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Focus Management & Esc Key Support
  useEffect(() => {
    if (subTopicId) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      closeBtnRef.current?.focus();
    }
    return () => {
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
        previousActiveElement.current.focus();
      }
    };
  }, [subTopicId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && subTopicId) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [subTopicId, onClose]);

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
      fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/works?sort=best&page=1&page_size=20`),
      fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/claims`),
    ]);

    if (requestId !== loadRequestId.current) return;

    if (detailResult.status === "fulfilled") {
      try {
        setSubTopicInfo(parseSubTopicDetailResponse(detailResult.value).subTopic as SubTopicItem);
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "详情结构无效");
      }
    } else {
      setDetailError(detailResult.reason instanceof Error ? detailResult.reason.message : "详情加载失败");
    }

    if (worksResult.status === "fulfilled") {
      try {
        setWorksData(parseTopicWorksResponse(worksResult.value) as TopicWorksResponse);
      } catch (error) {
        setWorksError(error instanceof Error ? error.message : "作品结构无效");
      }
    } else {
      setWorksError(worksResult.reason instanceof Error ? worksResult.reason.message : "作品加载失败");
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
        setClaimsError(error instanceof Error ? error.message : "撞车动态结构无效");
      }
    } else {
      setClaimsError(claimsResult.reason instanceof Error ? claimsResult.reason.message : "撞车动态加载失败");
    }
    setLoading(false);
  }, [subTopicId]);

  useEffect(() => {
    if (subTopicId) void loadData();
  }, [loadData, subTopicId]);

  if (!subTopicId) return null;

  const claim =
    subTopicInfo?.myClaim && (subTopicInfo.myClaim.status === "candidate" || subTopicInfo.myClaim.status === "scripting")
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
      : null
  );

  const runAction = async (handler: (id: string) => Promise<void>) => {
    try {
      setSubmitting(true);
      await handler(subTopicId);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* 遮罩：z-[60] */}
      <div
        className="fixed inset-0 bg-zinc-950/20 backdrop-blur-xs z-[60] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 抽屉面板：z-[61] */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed inset-y-0 right-0 z-[61] w-full max-w-xl bg-white/95 backdrop-blur-xl border-l border-zinc-200 shadow-2xl p-6 overflow-y-auto flex flex-col justify-between animate-in slide-in-from-right duration-200"
      >
        <div>
          <div className="flex items-start justify-between pb-4 border-b border-zinc-100 mb-4 pt-1">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-2 text-xs font-normal text-zinc-500 mb-1 truncate">
                <span>{subTopicInfo?.topics?.name || "常规母题"}</span>
                {subTopicInfo?.topic_groups?.name && <span>· {subTopicInfo.topic_groups.name}</span>}
                {subTopicInfo?.emotion_tag && (
                  <span className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs font-mono text-zinc-600 font-normal">
                    #{subTopicInfo.emotion_tag}
                  </span>
                )}
              </div>
              <h3 id="drawer-title" className="text-lg font-bold text-zinc-900 leading-snug">
                {subTopicInfo?.title || "子题详情"}
              </h3>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 active:scale-[0.97] transition-all shrink-0"
              title="关闭详情"
              aria-label="关闭详情"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {detailError ? (
            <div className="py-8 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-rose-600 mx-auto mb-2" />
              <p className="text-sm font-medium">详情加载失败</p>
              <p className="text-xs text-rose-600 mt-1 font-normal">{detailError}</p>
            </div>
          ) : (
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span>一句话选题 Hook</span>
              </div>
              <p className="text-sm font-normal text-zinc-800 leading-relaxed">
                “{subTopicInfo?.hook || "暂无 Hook"}”
              </p>
            </div>
          )}

          {loading && !subTopicInfo ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-normal">
              <RefreshCw className="w-4 h-4 text-zinc-400 animate-spin mx-auto mb-2" />
              <span>详情加载中...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 撞车动态 */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-zinc-500" />
                    <span>撞车动态</span>
                  </h4>
                  {claimsData && (
                    <span className="text-xs font-mono text-zinc-500 font-normal">
                      候选 {claimsData.candidateCount} · 脚本中 {claimsData.scriptingCount}
                    </span>
                  )}
                </div>
                {claimsError ? (
                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 font-normal">
                    {claimsError}
                  </div>
                ) : claimsData?.claims.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-200 rounded-lg bg-zinc-50/50 font-normal">
                    暂无团队成员认领
                  </div>
                ) : (
                  claimsData && (
                    <div className="space-y-1.5">
                      {claimsData.claims.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between bg-zinc-50 px-3 py-2 rounded-lg border border-zinc-200 text-xs"
                        >
                          <span className="font-medium text-zinc-800">{item.displayName}</span>
                          <span
                            className={
                              item.status === "scripting"
                                ? "bg-amber-100 text-amber-900 font-medium px-2 py-0.5 rounded text-xs"
                                : "bg-zinc-200/70 text-zinc-700 font-normal px-2 py-0.5 rounded text-xs"
                            }
                          >
                            {item.status === "scripting" ? "脚本撰写中" : "候选准备"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </section>

              {/* 作品数据汇总 */}
              {worksError ? (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 font-normal">
                  作品加载失败：{worksError}
                </div>
              ) : (
                worksData?.summary && (
                  <section>
                    <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-zinc-500" />
                      <span>合格作品数据汇总</span>
                    </h4>
                    <div className="grid grid-cols-3 gap-3 bg-zinc-50 rounded-xl p-3 border border-zinc-200 text-center text-xs">
                      <Metric label="合格作品数" value={String(worksData.summary.qualifiedWorkCount)} />
                      <Metric label="平均播放量" value={formatPlayCount(worksData.summary.averagePlayCount)} />
                      <Metric label="最高播放" value={formatPlayCount(worksData.summary.bestPlayCount)} accent />
                    </div>
                  </section>
                )
              )}

              {/* 最高播放文案摘录 */}
              {worksData?.summary?.bestCopy && (
                <section className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs">
                  <div className="text-xs font-medium text-zinc-500 mb-1.5">最高播放作品文案摘录</div>
                  <p className="text-zinc-700 line-clamp-4 leading-relaxed font-mono bg-white p-2.5 rounded-lg border border-zinc-200 font-normal">
                    {worksData.summary.bestCopy}
                  </p>
                </section>
              )}

              {/* 历史关联作品 */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">历史关联作品</h4>
                  <span className="text-xs font-mono text-zinc-500 font-normal">{worksData?.pagination.totalItems ?? 0} 条</span>
                </div>
                {worksData?.items.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-200 rounded-lg bg-zinc-50/50 font-normal">
                    暂无已上线的成片作品
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {(worksData?.items ?? []).map((item: TopicWorkItem) => (
                      <div
                        key={item.id}
                        className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs flex justify-between items-start gap-2"
                      >
                        <div>
                          <div className="font-semibold text-zinc-900 line-clamp-1">《{item.videoTitle}》</div>
                          {item.uploadedAt && (
                            <div className="text-xs text-zinc-500 font-mono mt-0.5 font-normal">
                              发布时间: {new Date(item.uploadedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-zinc-800 font-mono">{formatPlayCount(item.playCount)}</div>
                          <div className="text-xs text-zinc-500 font-normal">播放量</div>
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
        <div className="pt-4 mt-6 border-t border-zinc-200 space-y-2">
          <div className="flex items-center gap-2">
            {!action.canClaim && action.label === "脚本中" ? (
              <span className="flex-1 py-2 text-center rounded-lg border border-amber-200 bg-amber-50 text-amber-900 font-medium text-xs">
                脚本撰写中
              </span>
            ) : action.canStartScripting ? (
              <button
                type="button"
                onClick={() => void runAction(onStartScripting)}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 active:scale-[0.97] text-amber-900 font-medium text-xs transition-all disabled:opacity-50"
              >
                开始写脚本
              </button>
            ) : action.canClaim ? (
              <button
                type="button"
                onClick={() => void runAction(onClaim)}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50"
              >
                认领到候选
              </button>
            ) : null}
            {action.canReturn && (
              <button
                type="button"
                onClick={() => void runAction(onReturnClaim)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 active:scale-[0.97] text-zinc-700 font-medium text-xs transition-all disabled:opacity-50"
              >
                放回
              </button>
            )}
          </div>
          <a
            href={`/topics/${subTopicId}`}
            className="inline-flex items-center justify-center gap-1 w-full text-center text-xs text-[#5F82A8] hover:text-[#466984] font-medium py-1 transition-colors"
          >
            <span>查看完整详情页</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 font-normal">{label}</div>
      <div className={`font-semibold text-sm mt-0.5 font-mono ${accent ? "text-emerald-600" : "text-zinc-800"}`}>
        {value}
      </div>
    </div>
  );
}

function formatPlayCount(value: number | null) {
  if (value === null) return "未拉取";
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString();
}
