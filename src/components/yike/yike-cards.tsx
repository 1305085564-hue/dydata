"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Circle, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { YikeItem, YikeItemStatus, TransitionAction } from "./types";
import {
  COMPLEXITY_LABELS,
  TIME_BUCKET_LABELS,
  ITEM_TYPE_LABELS,
  TRANSITION_ACTIONS,
} from "./types";
import { Button } from "@/components/ui/button";

function StatusDot({ status }: { status: YikeItem["status"] }) {
  const map: Record<YikeItem["status"], string> = {
    planned: "bg-zinc-200",
    doing: "bg-[#D97757]",
    delegated: "bg-[#D99E55]",
    done: "bg-[#6FAA7D]",
  };
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full shrink-0",
        map[status]
      )}
      aria-hidden="true"
    />
  );
}

function ReminderBadges({ item }: { item: YikeItem }) {
  return (
    <div className="flex items-center gap-1.5">
      {item.isUrgent && (
        <span className="inline-flex items-center rounded-md border border-[#C9604D]/15 bg-[#C9604D]/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-[#C9604D]">
          加急
        </span>
      )}
      {item.dueDate && (
        <span className="inline-flex items-center rounded-md border border-[#D99E55]/15 bg-[#D99E55]/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-[#D99E55]">
          {item.dueDate === new Date().toISOString().slice(0, 10) ? "今天截止" : `截止 ${item.dueDate}`}
        </span>
      )}
      {item.itemType === "memo" && item.memoGranularity === "multiple" && (
        <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">
          可拆分
        </span>
      )}
    </div>
  );
}

function ItemMeta({ item }: { item: YikeItem }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-400">
      {item.areaName && <span>{item.areaName}</span>}
      <span>{COMPLEXITY_LABELS[item.complexity]}</span>
      <span>{TIME_BUCKET_LABELS[item.timeBucket]}</span>
      {item.itemType === "memo" && (
        <span className="text-zinc-400">{ITEM_TYPE_LABELS.memo}</span>
      )}
    </div>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

interface LaneCardProps {
  item: YikeItem;
  recommended?: boolean;
  className?: string;
  onClick?: () => void;
  onTransition?: (itemId: string, target: YikeItemStatus) => void;
  transitioning?: boolean;
}

export function LaneCard({
  item,
  recommended = false,
  className,
  onClick,
  onTransition,
  transitioning = false,
}: LaneCardProps) {
  const actions = TRANSITION_ACTIONS[item.status];

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
      whileTap={{ y: 0 }}
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5",
        item.itemType === "memo" && "bg-zinc-50/60",
        (onClick || onTransition) && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <StatusDot status={item.status} />
          <span
            className={cn(
              "text-[13px] leading-[1.6] text-zinc-800",
              item.status === "done" && "text-zinc-400 line-through"
            )}
          >
            {item.title}
          </span>
        </div>
        {recommended && (
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#D97757]" />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ItemMeta item={item} />
        <ReminderBadges item={item} />
      </div>

      {onTransition && actions.length > 0 && (
        <div className="yike-transition-bar pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end rounded-b-xl p-2">
          <div
            className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 rounded-lg border border-zinc-100 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((action) => (
              <Button
                key={action.target}
                variant={action.variant}
                size="xs"
                disabled={transitioning}
                onClick={() => onTransition(item.id, action.target)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface ProjectFocusCardProps {
  project: { id: string; name: string; nextTaskTitle?: string | null };
  className?: string;
}

export function ProjectFocusCard({ project, className }: ProjectFocusCardProps) {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
      whileTap={{ y: 0 }}
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3",
        className
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
        <Circle className="h-3 w-3 fill-[#D97757]/10 text-[#D97757]" />
        项目推进
      </div>
      <div className="space-y-0.5">
        <p className="text-[14px] font-semibold text-zinc-800">{project.name}</p>
        {project.nextTaskTitle ? (
          <p className="text-[13px] text-zinc-500">
            下一步：{project.nextTaskTitle}
          </p>
        ) : (
          <p className="text-[13px] text-[#C9604D]">缺少下一步任务</p>
        )}
      </div>
    </motion.div>
  );
}

interface EmptySlotProps {
  slotKey: string;
  label: string;
  description?: string;
  className?: string;
}

export function EmptySlot({ slotKey, label, description, className }: EmptySlotProps) {
  return (
    <div
      className={cn(
        "yike-empty-slot yike-calipers relative flex flex-col items-center justify-center gap-1 rounded-xl px-4 py-5 text-center text-zinc-400",
        className
      )}
    >
      <span className="text-[12px] font-medium">{label}</span>
      {description && <span className="text-[11px] text-zinc-300">{description}</span>}
    </div>
  );
}

interface LoadingSlotProps {
  className?: string;
  lines?: number;
}

export function LoadingSlot({ className, lines = 2 }: LoadingSlotProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3",
        className
      )}
    >
      <div className="yike-skeleton h-4 w-2/3" />
      {lines > 1 && <div className="yike-skeleton h-3 w-1/2" />}
    </div>
  );
}

export function LoadingHeroTask({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "yike-hero-task relative rounded-2xl border border-zinc-100 px-6 py-5",
        className
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="yike-skeleton h-4 w-20" />
        <div className="yike-skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="yike-skeleton mb-3 h-6 w-3/4" />
      <div className="yike-skeleton mb-4 h-4 w-1/2" />
      <div className="yike-skeleton h-9 w-24 rounded-lg" />
    </div>
  );
}

interface RecommendedChipProps {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function RecommendedChip({ title, onClick, disabled }: RecommendedChipProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { y: 0 }}
      className={cn(
        "yike-recommended-chip inline-flex max-w-[200px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-[12px]",
        disabled && "cursor-not-allowed opacity-60"
      )}
      title="完成当前主任务后继续做这一件"
    >
      {disabled ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-zinc-400" />
      ) : (
        <Sparkles className="h-3 w-3 shrink-0 text-[#D97757]" />
      )}
      <span className="truncate">{title}</span>
    </motion.button>
  );
}
