"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { TopicClaimItem } from "./types";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-[#E5E0D6] bg-white/95 p-6 shadow-claude-dialog sm:max-w-lg">
        <DialogHeader className="mb-0 border-b border-[#ECE7DE] pb-3">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-[#1C1917]">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F5F3EE] text-[#292524] font-semibold text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <span>候选槽位已满 (5/5)，选择要替换的选题</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <DialogBody className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1 pr-1">
            <DialogDescription className="mb-1 text-[13px] font-normal text-[#78716C]">
              即将认领新选题：
              <span className="font-semibold text-[#1C1917]">
                《{targetTopic.title}》
              </span>
              <span className="mt-2 block rounded-xl bg-[#FBF9F5] p-3 font-normal text-[#292524]">
                已为你自动推荐放回
                <span className="font-medium">挂机时间最长</span>
                的候选选题。脚本中的选题不会出现在替换列表。
              </span>
            </DialogDescription>

            {error && (
              <div className="rounded-r-lg border-l-2 border-l-[#C9604D] bg-red-50/50 p-3 text-[13px] font-normal text-[#292524]">
                {error}
              </div>
            )}

            <div className="shrink-0 text-[13px] font-normal text-[#292524]">
              选一条要放回的选题：
            </div>

            <div className="space-y-2">
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
                        : "bg-[#FBF9F5]/70 border-[#E5E0D6] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="replaceClaim"
                        checked={isSelected}
                        onChange={() => setSelectedReturnId(claim.subTopicId)}
                        className="mt-0.5 text-[#D97757] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                      />
                      <div>
                        <div className="text-[13px] font-normal text-[#292524]">
                          {sub?.title || "已认领子题"}
                        </div>
                        <div className="not-italic text-[13px] text-[#292524] line-clamp-1 mt-0.5 leading-relaxed">
                          “{sub?.hook || "还没有 Hook"}”
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="rounded bg-[#F5F3EE] px-1.5 py-0.5 text-[13px] font-normal tabular-nums text-[#292524]">
                        {daysIdle === 0 ? "今天认领" : `已挂机 ${daysIdle} 天`}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>

          </DialogBody>

          <DialogFooter className="flex-row justify-end border-t border-[#ECE7DE] pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#E5E0D6] px-4 py-1.5 text-[13px] font-medium text-[#292524] transition-all hover:bg-[#FBF9F5] active:scale-[0.985] active:duration-75"
                aria-label="取消替换"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading || !selectedReturnId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#D97757] px-4 py-1.5 text-[13px] font-medium text-white shadow-2xs transition-all hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 disabled:opacity-50"
                aria-label="确认替换并认领新选题"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                <span>{loading ? "替换中..." : "确认替换并认领新选题"}</span>
              </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
