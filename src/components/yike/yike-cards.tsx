"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Circle, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { YikeItem } from "./types";
import { COMPLEXITY_LABELS, TIME_BUCKET_LABELS, ITEM_TYPE_LABELS } from "./types";

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

export function LaneCard({
  item,
  recommended = false,
  className,
  onClick,
}: {
  item: YikeItem;
  recommended?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
      whileTap={{ y: 0 }}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5",
        item.itemType === "memo" && "bg-zinc-50/60",
        onClick && "cursor-pointer",
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
    </motion.div>
  );
}

export function ProjectFocusCard({
  project,
  className,
}: {
  project: { id: string; name: string; nextTaskTitle?: string | null };
  className?: string;
}) {
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
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.2em] text-zinc-400">
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

export function EmptySlot({
  slotKey,
  label,
  className,
}: {
  slotKey: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "yike-empty-slot flex flex-col items-center justify-center gap-1 rounded-xl px-4 py-5 text-center text-zinc-400",
        className
      )}
    >
      <span className="text-[12px] font-medium">{label}</span>
      <span className="text-[11px] text-zinc-300">空位</span>
    </div>
  );
}
