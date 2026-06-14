"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { YikeWorkbench, YikeItemStatus } from "./types";
import { QuickInput, StatusLanes, StatusLanesSkeleton } from "./yike-input-and-lanes";
import { ExecutionArea } from "./execution-area";
import {
  completeYikeFocus,
  quickCreateYikeItem,
  replaceYikeFocusSlot,
  transitionYikeItem,
} from "@/lib/yike/client";
import { cn } from "@/lib/utils";

interface YikePageProps {
  workbench: YikeWorkbench;
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
}

export function YikePage({ workbench, loading, error, onReload }: YikePageProps) {
  const [isCreating, setIsCreating] = React.useState(false);
  const [completingId, setCompletingId] = React.useState<string | null>(null);
  const [replacingSlot, setReplacingSlot] = React.useState<string | null>(null);
  const [transitioningId, setTransitioningId] = React.useState<string | null>(null);
  const [optimisticError, setOptimisticError] = React.useState<string | null>(null);

  const handleQuickSubmit = async (text: string) => {
    if (isCreating) return;
    setIsCreating(true);
    setOptimisticError(null);
    try {
      await quickCreateYikeItem({
        rawText: text,
        clientRequestId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      });
      onReload?.();
    } catch (err) {
      setOptimisticError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCompletePrimary = async (itemId: string, continueWithItemId?: string) => {
    if (completingId || !itemId) return;
    setCompletingId(itemId);
    setOptimisticError(null);
    try {
      await completeYikeFocus({
        itemId,
        continueWithItemId: continueWithItemId ?? null,
      });
      onReload?.();
    } catch (err) {
      setOptimisticError(err instanceof Error ? err.message : "完成任务失败");
    } finally {
      setCompletingId(null);
    }
  };

  const handleReplaceSlot = async (slotKey: "primary_task" | "candidate_1" | "candidate_2", itemId: string) => {
    if (replacingSlot) return;
    setReplacingSlot(slotKey);
    setOptimisticError(null);
    try {
      await replaceYikeFocusSlot({ slotKey, itemId });
      onReload?.();
    } catch (err) {
      setOptimisticError(err instanceof Error ? err.message : "替换执行槽失败");
    } finally {
      setReplacingSlot(null);
    }
  };

  const handleTransition = async (itemId: string, target: YikeItemStatus) => {
    if (transitioningId) return;
    setTransitioningId(itemId);
    setOptimisticError(null);
    try {
      await transitionYikeItem(itemId, { toStatus: target });
      onReload?.();
    } catch (err) {
      setOptimisticError(err instanceof Error ? err.message : "状态流转失败");
    } finally {
      setTransitioningId(null);
    }
  };

  const displayError = optimisticError ?? error;

  return (
    <div className={cn("yike-page mx-auto max-w-6xl space-y-8 pb-12", loading && "opacity-90")}>
      <AnimatePresence>
        {displayError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-[#C9604D]/15 bg-[#C9604D]/[0.04] px-4 py-3 text-[13px] text-[#C9604D]"
          >
            {displayError}
            {onReload && (
              <button
                onClick={onReload}
                className="ml-3 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[12px] font-medium text-[#C9604D] shadow-sm transition-colors hover:bg-zinc-50"
              >
                重试
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-semibold text-zinc-800">{workbench.workspace.name}</h1>
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            )}
          </div>
          <p className="text-[13px] text-zinc-500">
            {workbench.today} · 只关心现在最该做的一件
          </p>
        </div>
        <div className="flex items-center gap-2 text-right">
          {onReload && (
            <button
              onClick={onReload}
              disabled={loading}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
              aria-label="刷新"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          )}
        </div>
      </motion.header>

      <QuickInput onSubmit={handleQuickSubmit} isLoading={isCreating} />

      <ExecutionArea
        execution={workbench.execution}
        onCompletePrimary={handleCompletePrimary}
        onReplaceSlot={handleReplaceSlot}
        completingId={completingId}
        replacingSlot={replacingSlot}
        loading={loading}
      />

      <div className="yike-lane-divider" />

      {loading ? (
        <StatusLanesSkeleton />
      ) : (
        <StatusLanes
          lanes={workbench.lanes}
          onTransition={handleTransition}
          transitioningId={transitioningId}
        />
      )}
    </div>
  );
}
