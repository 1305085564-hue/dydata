"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExecutionArea, ExecutionSlot } from "./types";
import { LaneCard, ProjectFocusCard, EmptySlot } from "./yike-cards";

interface ExecutionAreaProps {
  execution: ExecutionArea;
  onCompletePrimary?: (itemId: string, continueWithItemId?: string) => void;
  onReplaceSlot?: (slotKey: "primary_task" | "candidate_1" | "candidate_2", itemId: string) => void;
  completingId?: string | null;
  replacingSlot?: string | null;
}

function PrimaryTask({
  slot,
  onComplete,
  isCompleting,
}: {
  slot: NonNullable<ExecutionArea["primaryTask"]>;
  onComplete?: (itemId: string) => void;
  isCompleting?: boolean;
}) {
  if (!slot.item) {
    return <EmptySlot slotKey={slot.slotKey} label="主任务" className="min-h-[160px]" />;
  }

  const handleComplete = () => {
    onComplete?.(slot.item!.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="yike-hero-task relative rounded-2xl border border-zinc-100 px-6 py-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="yike-section-title">现在专注</span>
        <span className="rounded-full bg-[#D97757]/10 px-2 py-0.5 text-[11px] font-medium text-[#D97757]">
          正在做
        </span>
      </div>
      <h2 className="mb-2 text-[18px] font-semibold leading-[1.5] text-zinc-800">{slot.item.title}</h2>
      {slot.item.note && (
        <p className="mb-3 text-[13px] leading-[1.7] text-zinc-500">{slot.item.note}</p>
      )}
      <div className="mb-4 flex items-center gap-3 text-[12px] text-zinc-400">
        {slot.item.projectName && <span>{slot.item.projectName}</span>}
        {slot.item.areaName && <span>{slot.item.areaName}</span>}
      </div>
      <motion.button
        onClick={handleComplete}
        disabled={isCompleting}
        whileHover={!isCompleting ? { scale: 1.02 } : {}}
        whileTap={!isCompleting ? { scale: 0.98 } : {}}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-4 text-[13px] font-medium transition-colors duration-150",
          isCompleting
            ? "border-zinc-200 bg-zinc-50 text-zinc-400"
            : "border-[#6FAA7D]/30 bg-[#6FAA7D]/[0.06] text-[#6FAA7D] hover:bg-[#6FAA7D]/10"
        )}
      >
        {isCompleting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            完成中
          </>
        ) : (
          "标记完成"
        )}
      </motion.button>
    </motion.div>
  );
}

function CandidateSlot({
  slot,
  onReplace,
  isReplacing,
}: {
  slot: NonNullable<ExecutionArea["candidateTasks"][number]>;
  onReplace?: (slotKey: "primary_task" | "candidate_1" | "candidate_2", itemId: string) => void;
  isReplacing?: boolean;
}) {
  if (!slot.item) {
    return <EmptySlot slotKey={slot.slotKey} label="候选" />;
  }

  const handleClick = () => {
    if (slot.requiresConfirmation && slot.item) {
      onReplace?.(slot.slotKey as "candidate_1" | "candidate_2", slot.item.id);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isReplacing}
      className={cn(
        "relative w-full text-left",
        slot.requiresConfirmation && !isReplacing && "cursor-pointer"
      )}
    >
      <LaneCard
        item={slot.item}
        recommended={slot.requiresConfirmation}
        className="yike-slot-card"
      />
      {isReplacing && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/60">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      )}
    </button>
  );
}

export function ExecutionArea({
  execution,
  onCompletePrimary,
  onReplaceSlot,
  completingId,
  replacingSlot,
}: ExecutionAreaProps) {
  const primary = execution.primaryTask;
  const candidates = execution.candidateTasks;
  const project = execution.projectFocus?.project ?? null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-zinc-800">当前执行区</h2>
        <span className="text-[12px] text-zinc-400">1 主任务 · 2 候选 · 1 项目</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {primary ? (
              <PrimaryTask
                key={primary.item?.id ?? "empty-primary"}
                slot={primary}
                onComplete={onCompletePrimary}
                isCompleting={completingId === primary.item?.id}
              />
            ) : (
              <EmptySlot key="empty-primary" slotKey="primary_task" label="主任务" className="min-h-[160px]" />
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-3">
            {candidates[0] ? (
              <CandidateSlot
                slot={candidates[0]}
                onReplace={onReplaceSlot}
                isReplacing={replacingSlot === candidates[0].slotKey}
              />
            ) : (
              <EmptySlot slotKey="candidate_1" label="候选 1" />
            )}
            {candidates[1] ? (
              <CandidateSlot
                slot={candidates[1]}
                onReplace={onReplaceSlot}
                isReplacing={replacingSlot === candidates[1].slotKey}
              />
            ) : (
              <EmptySlot slotKey="candidate_2" label="候选 2" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          {project ? (
            <ProjectFocusCard project={project} className="h-full min-h-[160px]" />
          ) : (
            <EmptySlot
              slotKey="project_focus"
              label="项目推进"
              className="h-full min-h-[160px]"
            />
          )}
        </div>
      </div>

      {execution.recommendedTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-4"
        >
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-zinc-500">
            <Plus className="h-3.5 w-3.5" />
            完成主任务后，这些在排队
          </div>
          <div className="flex flex-wrap gap-2">
            {execution.recommendedTasks.map((item) => (
              <motion.button
                key={item.id}
                whileHover={{ y: -1 }}
                whileTap={{ y: 0 }}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-600 transition-colors hover:border-[#D97757]/30 hover:bg-[#D97757]/[0.03]"
              >
                {item.title}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </section>
  );
}
