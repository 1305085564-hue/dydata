"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2, Plus, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ExecutionArea, ExecutionSlot, YikeItemStatus } from "./types";
import {
  LaneCard,
  ProjectFocusCard,
  EmptySlot,
  LoadingSlot,
  LoadingHeroTask,
  RecommendedChip,
} from "./yike-cards";
import { Button } from "@/components/ui/button";

interface ExecutionAreaProps {
  execution: ExecutionArea;
  onCompletePrimary?: (itemId: string, continueWithItemId?: string) => void;
  onReplaceSlot?: (slotKey: "primary_task" | "candidate_1" | "candidate_2", itemId: string) => void;
  completingId?: string | null;
  replacingSlot?: string | null;
  loading?: boolean;
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
    return (
      <EmptySlot
        slotKey={slot.slotKey}
        label="主任务"
        description="暂无正在进行的任务"
        className="min-h-[180px]"
      />
    );
  }

  const handleComplete = () => {
    onComplete?.(slot.item!.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -8 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="yike-hero-task relative rounded-2xl border border-zinc-100 px-6 py-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="yike-section-title">现在专注</span>
        <span className="rounded-full bg-[#D97757]/10 px-2.5 py-1 text-[11px] font-semibold text-[#D97757]">
          正在做
        </span>
      </div>
      <h2 className="mb-3 text-[20px] font-semibold leading-[1.5] tracking-tight text-zinc-800">
        {slot.item.title}
      </h2>
      {slot.item.note && (
        <p className="mb-4 text-[14px] leading-[1.7] text-zinc-500">{slot.item.note}</p>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3 text-[12px] text-zinc-400">
        {slot.item.projectName && <span>{slot.item.projectName}</span>}
        {slot.item.areaName && <span>{slot.item.areaName}</span>}
        {!slot.item.projectName && !slot.item.areaName && <span>个人事项</span>}
      </div>
      <Button
        onClick={handleComplete}
        disabled={isCompleting}
        variant="default"
        size="sm"
        className="gap-1.5"
      >
        {isCompleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : null}
        {isCompleting ? "完成中" : "标记完成"}
      </Button>
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
    return (
      <EmptySlot
        slotKey={slot.slotKey}
        label={slot.slotKey === "candidate_1" ? "候选 1" : "候选 2"}
        description="候选会从这里出现"
      />
    );
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
        "group relative w-full text-left",
        slot.requiresConfirmation && !isReplacing && "cursor-pointer"
      )}
      title={slot.requiresConfirmation ? "设为主任务" : undefined}
    >
      <LaneCard
        item={slot.item}
        recommended={slot.requiresConfirmation}
        className="yike-slot-card"
      />
      {slot.requiresConfirmation && (
        <div className="yike-slot-overlay absolute inset-0 flex items-center justify-center rounded-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#D97757] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm">
            {isReplacing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            {isReplacing ? "替换中" : "设为主任务"}
          </span>
        </div>
      )}
    </button>
  );
}

function ProjectSlot({
  slot,
}: {
  slot: NonNullable<ExecutionArea["projectFocus"]>;
}) {
  if (!slot.project) {
    return (
      <EmptySlot
        slotKey={slot.slotKey}
        label="项目推进"
        description="选一个项目作为当前推进"
      />
    );
  }

  return (
    <ProjectFocusCard
      project={slot.project}
      className="h-full min-h-[120px]"
    />
  );
}

export function ExecutionArea({
  execution,
  onCompletePrimary,
  onReplaceSlot,
  completingId,
  replacingSlot,
  loading,
}: ExecutionAreaProps) {
  const primary = execution.primaryTask;
  const candidates = execution.candidateTasks;
  const project = execution.projectFocus;

  const filledCount = [primary, ...candidates, project].filter(Boolean).length;
  const totalSlots = 4;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1], delay: 0.12 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-zinc-800">当前执行区</h2>
        <span className="text-[12px] text-zinc-400">
          {filledCount}/{totalSlots} 槽位 · 1 主任务 · 2 候选 · 1 项目
        </span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <LoadingHeroTask />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <LoadingSlot lines={2} />
            <LoadingSlot lines={2} />
            <LoadingSlot lines={2} />
          </div>
        </div>
      ) : (
        <>
          <AnimatePresence mode="wait">
            {primary ? (
              <PrimaryTask
                key={primary.item?.id ?? "empty-primary"}
                slot={primary}
                onComplete={onCompletePrimary}
                isCompleting={completingId === primary.item?.id}
              />
            ) : (
              <EmptySlot
                key="empty-primary"
                slotKey="primary_task"
                label="主任务"
                description="暂无正在进行的任务"
                className="min-h-[180px]"
              />
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {candidates[0] ? (
              <CandidateSlot
                slot={candidates[0]}
                onReplace={onReplaceSlot}
                isReplacing={replacingSlot === candidates[0].slotKey}
              />
            ) : (
              <EmptySlot
                slotKey="candidate_1"
                label="候选 1"
                description="候选会从这里出现"
              />
            )}
            {candidates[1] ? (
              <CandidateSlot
                slot={candidates[1]}
                onReplace={onReplaceSlot}
                isReplacing={replacingSlot === candidates[1].slotKey}
              />
            ) : (
              <EmptySlot
                slotKey="candidate_2"
                label="候选 2"
                description="候选会从这里出现"
              />
            )}
            {project ? (
              <ProjectSlot slot={project} />
            ) : (
              <EmptySlot
                slotKey="project_focus"
                label="项目推进"
                description="选一个项目作为当前推进"
              />
            )}
          </div>
        </>
      )}

      {execution.recommendedTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22 }}
          className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-4"
        >
          <div className="mb-2.5 flex items-center gap-2 text-[12px] font-medium text-zinc-500"
          >
            <Plus className="h-3.5 w-3.5" />
            完成主任务后，这些在排队
          </div>
          <div className="flex flex-wrap gap-2">
            {execution.recommendedTasks.map((item) => (
              <RecommendedChip
                key={item.id}
                title={item.title}
                onClick={() => onCompletePrimary?.(primary?.item?.id ?? "", item.id)}
                disabled={!primary?.item || completingId === primary.item.id}
              />
            ))}
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}
