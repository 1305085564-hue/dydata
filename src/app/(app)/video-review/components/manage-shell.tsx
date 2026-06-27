"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { feedbackToast } from "@/components/ui/feedback-toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { EmptyState } from "@/components/ui/empty-state";
import { getApiErrorMessage } from "@/lib/violations/errors";

import { QueueList } from "./queue-list";
import { ReviewDetail } from "./review-detail";
import type { ReviewQueueItem } from "./types";

interface ManageShellProps {
  initialQueue: ReviewQueueItem[];
  initialPendingCount: number;
}

export function ManageShell({
  initialQueue,
  initialPendingCount,
}: ManageShellProps) {
  const router = useRouter();
  const [queue, setQueue] = useState<ReviewQueueItem[]>(initialQueue);
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [activeId, setActiveId] = useState<string | null>(
    initialQueue[0]?.id ?? null,
  );
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  const [todayProcessed, setTodayProcessed] = useState(0);

  const [lightbox, setLightbox] = useState<{ paths: string[]; index: number } | null>(null);

  const activeItem = useMemo(
    () => queue.find((q) => q.id === activeId) ?? null,
    [activeId, queue],
  );

  const handleApprove = useCallback(
    async (draftId: string) => {
      const originalItem = queue.find((q) => q.id === draftId);
      if (!originalItem) return;

      const originalIndex = queue.findIndex((q) => q.id === draftId);

      setInFlightIds((prev) => {
        const next = new Set(prev);
        next.add(draftId);
        return next;
      });

      setQueue((prev) => {
        const idx = prev.findIndex((q) => q.id === draftId);
        if (idx === -1) return prev;
        const next = prev.filter((q) => q.id !== draftId);
        const nextActive = next[idx]?.id ?? next[Math.max(idx - 1, 0)]?.id ?? null;
        setActiveId(nextActive);
        return next;
      });

      setPendingCount((c) => Math.max(0, c - 1));
      setTodayProcessed((c) => c + 1);

      try {
        const res = await fetch(`/api/publish-drafts/${draftId}/approve`, {
          method: "POST",
        });
        const payload: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(getApiErrorMessage(payload, "通过失败"));
        }
        feedbackToast.success("已通过 · 已沉入数据页");
        router.refresh();
      } catch (e) {
        feedbackToast.error(e instanceof Error ? e.message : "通过失败");
        
        setQueue((prev) => {
          if (prev.some((q) => q.id === draftId)) return prev;
          const next = [...prev];
          const insertIdx = Math.min(originalIndex, next.length);
          next.splice(insertIdx, 0, originalItem);
          return next;
        });

        setPendingCount((c) => c + 1);
        setTodayProcessed((c) => Math.max(0, c - 1));
        setActiveId((curr) => curr ?? draftId);
      } finally {
        setInFlightIds((prev) => {
          const next = new Set(prev);
          next.delete(draftId);
          return next;
        });
      }
    },
    [queue, router],
  );

  const handleReject = useCallback(
    async (draftId: string, feedbackText: string) => {
      const trimmed = feedbackText.trim();
      if (!trimmed) {
        feedbackToast.error("请填写优化建议");
        return;
      }

      const originalItem = queue.find((q) => q.id === draftId);
      if (!originalItem) return;

      const originalIndex = queue.findIndex((q) => q.id === draftId);

      setInFlightIds((prev) => {
        const next = new Set(prev);
        next.add(draftId);
        return next;
      });

      setQueue((prev) => {
        const idx = prev.findIndex((q) => q.id === draftId);
        if (idx === -1) return prev;
        const next = prev.filter((q) => q.id !== draftId);
        const nextActive = next[idx]?.id ?? next[Math.max(idx - 1, 0)]?.id ?? null;
        setActiveId(nextActive);
        return next;
      });

      setPendingCount((c) => Math.max(0, c - 1));
      setTodayProcessed((c) => c + 1);

      try {
        const res = await fetch(`/api/publish-drafts/${draftId}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback_text: trimmed }),
        });
        const payload: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(getApiErrorMessage(payload, "打回失败"));
        }
        feedbackToast.success("已打回 · 等待提交者整改");
      } catch (e) {
        feedbackToast.error(e instanceof Error ? e.message : "打回失败");

        setQueue((prev) => {
          if (prev.some((q) => q.id === draftId)) return prev;
          const next = [...prev];
          const insertIdx = Math.min(originalIndex, next.length);
          next.splice(insertIdx, 0, originalItem);
          return next;
        });

        setPendingCount((c) => c + 1);
        setTodayProcessed((c) => Math.max(0, c - 1));
        setActiveId((curr) => curr ?? draftId);
      } finally {
        setInFlightIds((prev) => {
          const next = new Set(prev);
          next.delete(draftId);
          return next;
        });
      }
    },
    [queue],
  );

  // 键盘 j/k 翻队列
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      const idx = queue.findIndex((q) => q.id === activeId);
      if (idx < 0) return;
      const nextIdx = key === "j"
        ? Math.min(queue.length - 1, idx + 1)
        : Math.max(0, idx - 1);
      if (nextIdx === idx) return;
      e.preventDefault();
      setActiveId(queue[nextIdx].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, queue]);

  if (queue.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16">
        <EmptyState
          title="队列已清空"
          description={
            todayProcessed > 0
              ? `今日已处理 ${todayProcessed} 条 · 暂时没有待审稿件`
              : "暂时没有待审稿件，新稿件提交后会自动出现在这里"
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-[320px_1fr] gap-4 lg:gap-6">
        <QueueList
          items={queue}
          activeId={activeId}
          pendingCount={pendingCount}
          todayProcessed={todayProcessed}
          onSelect={setActiveId}
        />
        {activeItem ? (
          <ReviewDetail
            key={activeItem.id}
            item={activeItem}
            isProcessing={inFlightIds.has(activeItem.id)}
            onApprove={() => handleApprove(activeItem.id)}
            onReject={(text) => handleReject(activeItem.id, text)}
            onPreview={(paths, index) => setLightbox({ paths, index })}
          />
        ) : null}
      </div>

      {lightbox ? (
        <ImageLightbox
          paths={lightbox.paths}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(idx) =>
            setLightbox((prev) => (prev ? { ...prev, index: idx } : prev))
          }
        />
      ) : null}
    </>
  );
}
