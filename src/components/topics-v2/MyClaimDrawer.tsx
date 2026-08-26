"use client";

import React, { useState, useEffect, useRef } from "react";
import { Layers, X, AlertTriangle, RefreshCw } from "lucide-react";
import type { TopicClaimItem } from "./types";

interface MyClaimDrawerProps {
  claims: TopicClaimItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onStartScripting: (subTopicId: string) => Promise<void>;
  onReturnClaim: (subTopicId: string) => Promise<void>;
  onSelectTopic: (subTopicId: string) => void;
}

export function MyClaimDrawer({
  claims,
  loading,
  error,
  onRetry,
  onStartScripting,
  onReturnClaim,
  onSelectTopic,
}: MyClaimDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const triggerBtnRef = useRef<HTMLButtonElement | null>(null);

  const activeClaims = claims.filter(
    (c) => c.status === "candidate" || c.status === "scripting",
  );
  const candidateCount = activeClaims.filter(
    (c) => c.status === "candidate",
  ).length;
  const scriptingCount = activeClaims.filter(
    (c) => c.status === "scripting",
  ).length;

  // Esc key & Focus management
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current =
        document.activeElement as HTMLElement | null;
    }
    return () => {
      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === "function"
      ) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleStartScripting = async (
    e: React.MouseEvent,
    subTopicId: string,
  ) => {
    e.stopPropagation();
    try {
      setOperatingId(subTopicId);
      await onStartScripting(subTopicId);
    } finally {
      setOperatingId(null);
    }
  };

  const handleReturn = async (e: React.MouseEvent, subTopicId: string) => {
    e.stopPropagation();
    try {
      setOperatingId(subTopicId);
      await onReturnClaim(subTopicId);
    } finally {
      setOperatingId(null);
    }
  };

  return (
    <div className="relative">
      {/* 触发控制条 (紧凑气垫微胶囊) */}
      <button
        ref={triggerBtnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="打开我的选题库槽位"
        className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F5F3EE] hover:bg-[#ECE7DE] text-[#292524] hover:text-[#1C1917] active:scale-[0.985] active:duration-75 transition-all cursor-pointer select-none text-xs font-medium"
      >
        <Layers className="size-3.5 text-[#78716C]" />
        <span>槽位</span>
        <span className="tabular-nums font-semibold text-[#1C1917]">
          {candidateCount}/5
        </span>
        {scriptingCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#D97757] font-semibold">
            <span className="size-1.5 rounded-full bg-[#D97757]" />
            <span>{scriptingCount}篇中</span>
          </span>
        )}
      </button>

      {/* 抽屉下拉浮层 */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[61]"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="claim-drawer-title"
            className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-[#FAF8F4]/98 backdrop-blur-xl border border-[#E5E0D6] rounded-xl shadow-claude-float z-[62] p-4 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#ECE7DE]">
              <div>
                <h4
                  id="claim-drawer-title"
                  className="font-serif text-sm font-semibold tracking-tight text-[#1C1917]"
                >
                  我的选题认领
                </h4>
                <p className="text-xs text-[#292524] mt-0.5 font-normal">
                  候选最多保留 5 条，及时放回不写的选题
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[#78716C] hover:text-[#292524] p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg hover:bg-[#F5F3EE] transition-colors cursor-pointer"
                title="关闭"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 槽位进度条 */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-[#292524] mb-1 font-normal">
                <span>候选占用率</span>
                <span className="tabular-nums text-[#292524] font-medium">
                  {candidateCount} / 5
                </span>
              </div>
              <div className="h-1.5 bg-[#F5F3EE] rounded-full overflow-hidden flex">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 border-r border-white transition-colors duration-200 ${
                      idx < candidateCount
                        ? candidateCount === 5
                          ? "bg-[#DC2626]"
                          : "bg-[#D97757]"
                        : "bg-[#E5E0D6]"
                    }`}
                  />
                ))}
              </div>
              {candidateCount === 5 && (
                <div className="flex items-center gap-1.5 text-xs text-[#DC2626] mt-1.5 font-normal">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#DC2626]" />
                  <span>候选槽位已满（5/5），请先放回不写的选题。</span>
                </div>
              )}
            </div>

            {/* 认领列表 */}
            {error ? (
              <div className="py-6 text-center text-xs text-[#292524] bg-red-50/50 rounded-lg">
                <p className="font-medium">我的认领加载失败</p>
                <p className="mt-1 text-[#DC2626] font-normal">{error}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-3 inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#E5E0D6] text-xs font-medium text-[#292524] hover:bg-[#F5F3EE] cursor-pointer"
                  aria-label="重试加载"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>重试</span>
                </button>
              </div>
            ) : loading ? (
              <div className="py-6 text-center text-xs text-[#78716C] font-normal">
                <RefreshCw className="w-4 h-4 text-[#78716C] animate-spin mx-auto mb-1" />
                <span>加载认领列表中...</span>
              </div>
            ) : activeClaims.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#78716C] font-normal rounded-lg bg-[#F5F3EE]/50">
                暂未认领任何选题，浏览大盘点击“认领”
              </div>
            ) : (
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {/* 1. 候选池区块 */}
                {activeClaims.filter((c) => c.status === "candidate").length >
                  0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-[#292524] flex items-center justify-between pb-1 border-b border-[#ECE7DE]">
                      <span>候选池 (占用 {candidateCount}/5 配额)</span>
                    </div>
                    {activeClaims
                      .filter((c) => c.status === "candidate")
                      .map((claim) => {
                        const sub = claim.subTopic;
                        return (
                          <div
                            key={claim.id}
                            onClick={() => sub?.id && onSelectTopic(sub.id)}
                            className="group p-3 rounded-lg border border-[#E5E0D6] bg-[#FBF9F5]/50 hover:bg-white hover:border-[#E5E0D6] transition-all cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-xs font-medium text-[#292524] group-hover:text-[#D97757] line-clamp-1">
                                {sub?.title || "选题名"}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded font-normal shrink-0 bg-[#F5F3EE] text-[#292524]">
                                候选准备
                              </span>
                            </div>
                            <p className="font-serif not-italic text-xs text-[#292524] line-clamp-1 mb-2 leading-relaxed">
                              “{sub?.hook || "还没有 Hook"}”
                            </p>

                            <div className="flex items-center justify-between pt-2 border-t border-[#ECE7DE] text-xs">
                              <span className="text-[#78716C] font-normal tabular-nums">
                                {claim.claimedAt
                                  ? new Date(
                                      claim.claimedAt,
                                    ).toLocaleDateString()
                                  : "时间未知"}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={operatingId === claim.subTopicId}
                                  onClick={(e) =>
                                    handleStartScripting(e, claim.subTopicId)
                                  }
                                  className="px-2.5 py-1.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center rounded bg-[#D97757] text-white hover:bg-[#C46A4D] text-xs transition-colors font-medium shadow-2xs cursor-pointer"
                                  aria-label="开始写脚本"
                                >
                                  开始写脚本
                                </button>
                                <button
                                  type="button"
                                  disabled={operatingId === claim.subTopicId}
                                  onClick={(e) =>
                                    handleReturn(e, claim.subTopicId)
                                  }
                                  className="px-2.5 py-1.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center rounded bg-[#F5F3EE] text-[#292524] hover:bg-[#E5E0D6] text-xs transition-colors font-normal cursor-pointer"
                                  aria-label="放回选题"
                                >
                                  放回
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* 2. 脚本撰写中区块 */}
                {activeClaims.filter((c) => c.status === "scripting").length >
                  0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-[#292524] flex items-center justify-between pb-1 border-b border-[#ECE7DE]">
                      <span>撰写中 (已锁定不占候选配额)</span>
                    </div>
                    {activeClaims
                      .filter((c) => c.status === "scripting")
                      .map((claim) => {
                        const sub = claim.subTopic;
                        return (
                          <div
                            key={claim.id}
                            onClick={() => sub?.id && onSelectTopic(sub.id)}
                            className="group p-3 rounded-lg border border-[#E5E0D6] bg-[#F5F3EE]/30 hover:bg-white hover:border-[#E5E0D6] transition-all cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-xs font-medium text-[#292524] group-hover:text-[#D97757] line-clamp-1">
                                {sub?.title || "选题名"}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded font-normal shrink-0 bg-[#F5F3EE] text-[#292524]">
                                脚本中
                              </span>
                            </div>
                            <p className="font-serif not-italic text-xs text-[#292524] line-clamp-1 mb-2 leading-relaxed">
                              “{sub?.hook || "还没有 Hook"}”
                            </p>

                            <div className="flex items-center justify-between pt-2 border-t border-[#ECE7DE] text-xs">
                              <span className="text-[#78716C] font-normal tabular-nums">
                                {claim.claimedAt
                                  ? new Date(
                                      claim.claimedAt,
                                    ).toLocaleDateString()
                                  : "时间未知"}
                              </span>
                              <button
                                type="button"
                                disabled={operatingId === claim.subTopicId}
                                onClick={(e) =>
                                  handleReturn(e, claim.subTopicId)
                                }
                                className="px-2.5 py-1.5 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center rounded bg-[#F5F3EE] text-[#292524] hover:bg-[#E5E0D6] text-xs transition-colors font-normal cursor-pointer"
                                aria-label="放回选题"
                              >
                                放回
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
