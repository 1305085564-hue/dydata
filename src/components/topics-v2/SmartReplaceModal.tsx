"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import type { TopicClaimItem } from "./types";

interface SmartReplaceModalProps {
  isOpen: boolean;
  targetTopic: { id: string; title: string; hook: string } | null;
  myClaims: TopicClaimItem[];
  onClose: () => void;
  onConfirmReplace: (
    returnedSubTopicId: string,
    targetSubTopicId: string,
  ) => Promise<boolean>;
}

export function SmartReplaceModal({
  isOpen,
  targetTopic,
  myClaims,
  onClose,
  onConfirmReplace,
}: SmartReplaceModalProps) {
  const [selectedReturnId, setSelectedReturnId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 只有候选状态占用可替换槽位，脚本中记录不能被替换。
  const candidateClaims = useMemo(
    () => myClaims.filter((claim) => claim.status === "candidate"),
    [myClaims],
  );

  // 自动计算挂机最久的那个选题 (claimed_at 最早)
  useEffect(() => {
    if (isOpen && candidateClaims.length > 0) {
      const sorted = [...candidateClaims].sort(
        (a, b) =>
          (Date.parse(a.claimedAt ?? "") || 0) -
          (Date.parse(b.claimedAt ?? "") || 0),
      );
      setSelectedReturnId(sorted[0].subTopicId);
      setError(null);
    }
  }, [isOpen, candidateClaims]);

  // Focus Management & Esc Key Support
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current =
        document.activeElement as HTMLElement | null;
      closeBtnRef.current?.focus();
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
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !targetTopic) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturnId) return;

    try {
      setLoading(true);
      const succeeded = await onConfirmReplace(
        selectedReturnId,
        targetTopic.id,
      );
      if (succeeded) onClose();
      else setError("替换失败，原认领保持不变，请检查提示后重试。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "替换失败，原认领保持不变");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* 遮罩：z-[60] */}
      <div
        className="fixed inset-0 bg-zinc-950/25 backdrop-blur-xs z-[60] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 毛玻璃黄金比例弹窗：z-[61] */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="replace-modal-title"
          className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white/95 backdrop-blur-xl border border-zinc-200 rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 shrink-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-100 text-zinc-600 font-semibold text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <h3
                id="replace-modal-title"
                className="text-base font-semibold text-zinc-900"
              >
                候选槽位已满 (5/5)，请选择替换
              </h3>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              title="关闭弹窗"
              aria-label="关闭弹窗"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-4 shrink-0">
            <p className="text-xs text-zinc-500 mb-2 font-normal">
              即将认领新选题：
              <span className="font-semibold text-zinc-900">
                《{targetTopic.title}》
              </span>
            </p>
            <div className="bg-zinc-50 rounded-xl p-3 text-xs text-zinc-600 font-normal">
              系统已为您自动推荐放回
              <span className="font-medium">挂机时间最长</span>
              的候选选题。脚本中的选题不会出现在替换列表。
            </div>
          </div>

          {error && (
            <div className="mb-3 p-3 bg-zinc-100 border border-zinc-200 rounded-lg text-xs text-zinc-600 font-normal shrink-0">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden"
          >
            <div className="text-xs font-normal text-zinc-600 shrink-0">
              请选择要被替换放回的选题：
            </div>

            <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
              {candidateClaims.map((claim) => {
                const sub = claim.subTopic;
                const isSelected = selectedReturnId === claim.subTopicId;
                const daysIdle = Math.floor(
                  (Date.now() -
                    (Date.parse(claim.claimedAt ?? "") || Date.now())) /
                    (1000 * 3600 * 24),
                );

                return (
                  <label
                    key={claim.id}
                    onClick={() => setSelectedReturnId(claim.subTopicId)}
                    className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#D97757]/5 border-[#D97757] shadow-2xs"
                        : "bg-zinc-50/70 border-zinc-200 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="replaceClaim"
                        checked={isSelected}
                        onChange={() => setSelectedReturnId(claim.subTopicId)}
                        className="mt-0.5 text-[#D97757] focus:ring-[#D97757]"
                      />
                      <div>
                        <div className="text-xs font-normal text-zinc-600">
                          {sub?.title || "已认领子题"}
                        </div>
                        <div className="text-xs text-zinc-500 line-clamp-1 mt-0.5 font-normal">
                          “{sub?.hook || "暂无 Hook"}”
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-normal tabular-nums px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
                        {daysIdle === 0 ? "今天认领" : `已挂机 ${daysIdle} 天`}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="pt-4 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 active:scale-[0.97] text-xs font-medium transition-all"
                aria-label="取消替换"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading || !selectedReturnId}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] text-white text-xs font-medium shadow-2xs transition-all disabled:opacity-50"
                aria-label="确认替换并认领新选题"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                <span>{loading ? "替换中..." : "确认替换并认领新选题"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
