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

  const activeClaims = claims.filter((c) => c.status === "candidate" || c.status === "scripting");
  const candidateCount = activeClaims.filter((c) => c.status === "candidate").length;
  const scriptingCount = activeClaims.filter((c) => c.status === "scripting").length;

  // Esc key & Focus management
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
    }
    return () => {
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
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

  const handleStartScripting = async (e: React.MouseEvent, subTopicId: string) => {
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
      {/* 触发控制条 */}
      <button
        ref={triggerBtnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="打开我的选题库槽位"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 active:scale-[0.97] transition-all shadow-2xs"
      >
        <span className="w-2 h-2 rounded-full bg-[#D97757]" />
        <Layers className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-800">我的选题槽位</span>
        <div className="flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-normal">
          <span>{candidateCount}</span>
          <span className="text-zinc-400">/</span>
          <span>5</span>
        </div>
        {scriptingCount > 0 && (
          <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200/80 px-1.5 py-0.5 rounded-full font-medium">
            {scriptingCount} 脚本中
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
            className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-xl border border-zinc-200 rounded-xl shadow-xl z-[62] p-4 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100">
              <div>
                <h4 id="claim-drawer-title" className="text-sm font-semibold text-zinc-900">
                  我的选题认领
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5 font-normal">
                  候选最多保留 5 条，及时放回不写的选题
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg hover:bg-zinc-100 transition-colors"
                title="关闭"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 槽位进度条 */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-1 font-normal">
                <span>候选占用率</span>
                <span className="font-mono text-zinc-700 font-semibold">{candidateCount} / 5</span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden flex">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 border-r border-white transition-colors duration-200 ${
                      idx < candidateCount
                        ? candidateCount === 5
                          ? "bg-rose-500"
                          : "bg-[#D97757]"
                        : "bg-zinc-200"
                    }`}
                  />
                ))}
              </div>
              {candidateCount === 5 && (
                <div className="flex items-center gap-1.5 text-xs text-rose-600 mt-1.5 font-normal">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                  <span>候选槽位已满（5/5），请先放回不写的选题。</span>
                </div>
              )}
            </div>

            {/* 认领列表 */}
            {error ? (
              <div className="py-6 text-center text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                <p className="font-medium">我的认领加载失败</p>
                <p className="mt-1 text-rose-600 font-normal">{error}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-100"
                  aria-label="重试加载"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>重试</span>
                </button>
              </div>
            ) : loading ? (
              <div className="py-6 text-center text-xs text-zinc-500 font-normal">
                <RefreshCw className="w-4 h-4 text-zinc-400 animate-spin mx-auto mb-1" />
                <span>加载认领列表中...</span>
              </div>
            ) : activeClaims.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-normal border border-dashed border-zinc-200 rounded-lg bg-zinc-50/50">
                暂未认领任何选题，浏览大盘点击“认领”
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {activeClaims.map((claim) => {
                  const sub = claim.subTopic;
                  const isScripting = claim.status === "scripting";

                  return (
                    <div
                      key={claim.id}
                      onClick={() => sub?.id && onSelectTopic(sub.id)}
                      className="group p-3 rounded-lg border border-zinc-200 bg-zinc-50/50 hover:bg-white hover:border-zinc-300 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-normal text-zinc-600 group-hover:text-[#D97757] line-clamp-1">
                          {sub?.title || "选题名"}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-normal shrink-0 ${
                            isScripting
                              ? "bg-sky-50 text-sky-700 border border-sky-200/80"
                              : "bg-zinc-200/80 text-zinc-700"
                          }`}
                        >
                          {isScripting ? "脚本撰写中" : "候选准备"}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 line-clamp-1 mb-2 font-normal">
                        “{sub?.hook || "暂无 Hook"}”
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs">
                        <span className="text-zinc-500 font-normal tabular-nums">
                          {claim.claimedAt ? new Date(claim.claimedAt).toLocaleDateString() : "时间未知"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {!isScripting && (
                            <button
                              type="button"
                              disabled={operatingId === claim.subTopicId}
                              onClick={(e) => handleStartScripting(e, claim.subTopicId)}
                              className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs border border-sky-200/80 transition-colors font-medium"
                              aria-label="开始写脚本"
                            >
                              开始写脚本
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={operatingId === claim.subTopicId}
                            onClick={(e) => handleReturn(e, claim.subTopicId)}
                            className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 text-xs transition-colors font-normal"
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
          </div>
        </>
      )}
    </div>
  );
}
