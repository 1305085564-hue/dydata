"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpToLine, Check, FolderKanban, GitBranch, Loader2, Repeat2, Sparkles, Trash2, User } from "lucide-react";
import { motion } from "framer-motion";
import type { YikeItem, YikeItemStatus, YikeProjectFocus } from "./types";
import {
  COMPLEXITY_LABELS,
  TIME_BUCKET_LABELS,
  ITEM_TYPE_LABELS,
  TRANSITION_ACTIONS,
} from "./types";
import { resolveAreaColor } from "./area-colors";
import { Button } from "@/components/ui/button";

function StatusDot({ status }: { status: YikeItemStatus }) {
  const map: Record<YikeItemStatus, string> = {
    planned: "bg-zinc-300",
    doing: "bg-[#D97757]",
    delegated: "bg-[#9B7BD9]",
    done: "bg-[#6FAA7D]",
  };
  return (
    <span
      className={cn("mt-[7px] inline-block h-1.5 w-1.5 rounded-full shrink-0", map[status])}
      aria-hidden="true"
    />
  );
}

function isDueToday(date: string | null) {
  return date != null && date === new Date().toISOString().slice(0, 10);
}

function ReminderBadges({ item }: { item: YikeItem }) {
  const overdue = item.dueDate != null && item.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <>
      {item.isUrgent && (
        <span className="inline-flex items-center rounded-md bg-[#C9604D]/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-[#C9604D]">
          加急
        </span>
      )}
      {item.dueDate && (
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            overdue
              ? "bg-[#C9604D]/[0.08] text-[#C9604D]"
              : "bg-[#D99E55]/[0.1] text-[#B07B2E]",
          )}
        >
          {isDueToday(item.dueDate) ? "今天截止" : `截 ${item.dueDate.slice(5)}`}
        </span>
      )}
    </>
  );
}

/** 元信息标签：领域 / 项目 / 复杂度 / 时间桶 / 负责人 / 跟进 */
function MetaChips({ item, showPerson }: { item: YikeItem; showPerson?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {showPerson && item.assigneeName && (
        <span className="inline-flex items-center gap-1 rounded-md bg-[#9B7BD9]/[0.1] px-1.5 py-0.5 font-medium text-[#7A5BB8]">
          <User className="h-3 w-3" />
          {item.assigneeName}
        </span>
      )}
      <ReminderBadges item={item} />
      {item.projectName && (
        <span className="inline-flex items-center rounded-md bg-zinc-200/60 px-1.5 py-0.5 text-zinc-500">
          {item.projectName}
        </span>
      )}
      {item.areaName && <span className="text-zinc-400">{item.areaName}</span>}
      <span className="text-zinc-400">{COMPLEXITY_LABELS[item.complexity]}</span>
      <span className="text-zinc-400">
        {showPerson && item.followUpBucket
          ? TIME_BUCKET_LABELS[item.followUpBucket]
          : TIME_BUCKET_LABELS[item.timeBucket]}
      </span>
      {item.itemType === "memo" && <span className="text-zinc-400">{ITEM_TYPE_LABELS.memo}</span>}
    </div>
  );
}

const cardEnter = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

const cardExit = { opacity: 0, scale: 0.96, transition: { duration: 0.15 } };

interface LaneCardProps {
  item: YikeItem;
  candidate?: boolean;
  auxRank?: number;
  className?: string;
  onOpen?: (item: YikeItem) => void;
  onTransition?: (itemId: string, target: YikeItemStatus) => void;
  onConvert?: (itemId: string) => void;
  onSplit?: (item: YikeItem) => void;
  onPromote?: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
  busy?: boolean;
  draggable?: boolean;
  onDragStartCard?: (item: YikeItem) => void;
  onDragEndCard?: (item: YikeItem, point: { x: number; y: number }) => void;
}

/** 标准事项卡：四栏通用。hover 滑出操作条。 */
export function LaneCard({
  item,
  candidate = false,
  auxRank,
  className,
  onOpen,
  onTransition,
  onConvert,
  onSplit,
  onPromote,
  onDelete,
  busy = false,
  draggable = false,
  onDragStartCard,
  onDragEndCard,
}: LaneCardProps) {
  const actions = TRANSITION_ACTIONS[item.status];
  const isDone = item.status === "done";
  const isMemo = item.itemType === "memo";
  const canConvert = isMemo && (item.status === "planned" || item.status === "doing");
  const canSplit = isMemo && item.memoGranularity === "multiple";
  const areaColor = resolveAreaColor(item.areaColor);
  const [dragging, setDragging] = React.useState(false);

  return (
    <motion.div
      layout={!dragging}
      layoutId={`yike-${item.id}`}
      variants={cardEnter}
      exit={cardExit}
      drag={draggable}
      dragSnapToOrigin
      dragElastic={0.12}
      dragMomentum={false}
      whileDrag={{ scale: 0.9, opacity: 0.25, zIndex: 50, cursor: "grabbing" }}
      onDragStart={() => {
        setDragging(true);
        onDragStartCard?.(item);
      }}
      onDragEnd={(_e, info) => {
        setDragging(false);
        onDragEndCard?.(item, { x: info.point.x, y: info.point.y });
      }}
      onClick={() => {
        if (!dragging) onOpen?.(item);
      }}
      style={
        areaColor && !isDone
          ? ({ backgroundColor: areaColor.tintBg } as React.CSSProperties)
          : undefined
      }
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-xl px-3.5 py-2.5",
        "transition-[box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
        // 无边框，靠底色分层：默认/备忘统一淡灰瓦片；领域卡用内联 tint 背景覆盖
        "bg-zinc-100/70",
        candidate && !isDone && "ring-1 ring-inset ring-[#D97757]/25",
        isDone && "opacity-55",
        draggable && "cursor-grab active:cursor-grabbing touch-none",
        onOpen && "cursor-pointer hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      {candidate && !isDone && (
        <span className="absolute -top-2 right-3 rounded bg-[#FBF4F1] px-1.5 py-0.5 text-[10px] font-semibold text-[#D97757]">
          候选
        </span>
      )}

      <div className="flex items-start gap-2.5">
        {auxRank ? (
          <span
            className="mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#D97757]/15 text-[10px] font-semibold text-[#C96442]"
            title="同时在做，次于主任务"
          >
            {auxRank}
          </span>
        ) : (
          <StatusDot status={item.status} />
        )}
        <span
          className={cn(
            "text-[13px] leading-[1.6] text-zinc-800 line-clamp-1 group-hover:line-clamp-none",
            isDone && "text-zinc-400 line-through",
          )}
        >
          {item.title}
        </span>
      </div>

      <div className="ml-4">
        <MetaChips item={item} showPerson={item.status === "delegated"} />
      </div>

      {!isDone && (isMemo && item.note ? true : onTransition || canConvert || canSplit || onDelete) && (
        <div className="yike-action-reveal ml-4" onClick={(e) => e.stopPropagation()}>
          <div className="yike-action-reveal-inner flex flex-col gap-2 pt-2">
            {isMemo && item.note && (
              <p className="rounded-md bg-white/70 px-2 py-1 text-[12px] leading-[1.55] text-zinc-500">
                {item.note}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1">
            {onPromote && item.status === "doing" && (
              <Button variant="secondary" size="xs" disabled={busy} onClick={() => onPromote(item.id)}>
                <ArrowUpToLine /> 设为焦点
              </Button>
            )}
            {canConvert && onConvert && (
              <Button variant="secondary" size="xs" disabled={busy} onClick={() => onConvert(item.id)}>
                <Repeat2 /> 转任务
              </Button>
            )}
            {canSplit && onSplit && (
              <Button variant="secondary" size="xs" disabled={busy} onClick={() => onSplit(item)}>
                <GitBranch /> 拆分
              </Button>
            )}
            {onTransition &&
              actions.map((action) => (
                <Button
                  key={action.target}
                  variant={action.variant}
                  size="xs"
                  disabled={busy}
                  onClick={() => onTransition(item.id, action.target)}
                >
                  {action.label}
                </Button>
              ))}
            {onDelete && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(item.id)}
                className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-[#C9604D]/10 hover:text-[#C9604D] disabled:opacity-50"
                aria-label="删除"
                title="删除（移入回收）"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface FocusCardProps {
  item: YikeItem;
  onComplete: (itemId: string, continueWithItemId?: string) => void;
  onOpen?: (item: YikeItem) => void;
  completing?: boolean;
}

/** 正在做栏顶的焦点大卡：全页唯一主角破格。 */
export function FocusCard({ item, onComplete, onOpen, completing }: FocusCardProps) {
  return (
    <motion.div
      layout
      layoutId={`yike-${item.id}`}
      variants={cardEnter}
      exit={cardExit}
      className="yike-hero-task flex min-h-[164px] flex-col rounded-2xl px-5 py-4"
    >
      <div className="mb-2 flex items-center justify-between pl-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          正在专注焦点
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBF4F1] px-2.5 py-1 text-[11px] font-medium text-[#D97757]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D97757]" />
          正在做
        </span>
      </div>

      <button
        type="button"
        onClick={() => onOpen?.(item)}
        className="block w-full pl-2 text-left"
      >
        <h2 className="text-[17px] font-semibold leading-snug text-zinc-900 hover:text-[#C96442]">
          {item.title}
        </h2>
        {item.note && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.6] text-zinc-500">{item.note}</p>
        )}
      </button>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pl-2 pt-4">
        <MetaChips item={item} />
        <Button
          variant="default"
          size="sm"
          disabled={completing}
          onClick={() => onComplete(item.id)}
          className="shrink-0 border border-[#6FAA7D]/30 bg-[#6FAA7D]/10 text-[#4C7A58] hover:bg-[#6FAA7D]/20"
        >
          {completing ? <Loader2 className="animate-spin" /> : <Check />}
          标记完成
        </Button>
      </div>
    </motion.div>
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { y: 0 }}
      className={cn(
        "yike-recommended-chip inline-flex max-w-[200px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-left text-[12px]",
        disabled && "cursor-not-allowed opacity-60",
      )}
      title="完成当前主任务后继续做这一件"
    >
      <Sparkles className="h-3 w-3 shrink-0 text-[#D97757]" />
      <span className="truncate">{title}</span>
    </motion.button>
  );
}

/** 正在做的固定空槽占位：提示这一格放什么。 */
export function SlotPlaceholder({ label, hint }: { label: string; hint?: string }) {
  return (
    <motion.div
      layout
      className="yike-slot-placeholder flex min-h-[56px] flex-col justify-center gap-0.5 rounded-xl px-3.5 py-2.5"
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{label}</span>
      {hint && <span className="text-[11px] text-zinc-300">{hint}</span>}
    </motion.div>
  );
}

/** 正在做槽4：项目推进卡，展示项目名 + 下一步任务。 */
export function ProjectSlotCard({
  project,
  onOpen,
}: {
  project: YikeProjectFocus;
  onOpen?: (project: YikeProjectFocus) => void;
}) {
  return (
    <motion.div
      layout
      layoutId={`yike-project-${project.projectId}`}
      variants={cardEnter}
      exit={cardExit}
      onClick={() => onOpen?.(project)}
      className={cn(
        "group relative flex flex-col gap-1 rounded-xl bg-[#9B7BD9]/[0.08] px-3.5 py-2.5",
        "transition-[box-shadow] duration-150",
        onOpen && "cursor-pointer hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.16)]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[#7A5BB8]" />
        <span className="truncate text-[12px] font-medium text-[#7A5BB8]">{project.projectName}</span>
      </div>
      <span className="ml-5 line-clamp-2 text-[13px] leading-[1.5] text-zinc-700">
        {project.nextTaskTitle ?? "缺下一步任务"}
      </span>
    </motion.div>
  );
}

export function LoadingSlot({ className, lines = 2 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl bg-zinc-100/70 px-3.5 py-2.5", className)}>
      <div className="yike-skeleton h-4 w-2/3" />
      {lines > 1 && <div className="yike-skeleton h-3 w-1/2" />}
    </div>
  );
}

export function LoadingHeroTask({ className }: { className?: string }) {
  return (
    <div className={cn("yike-hero-task rounded-2xl px-5 py-4", className)}>
      <div className="mb-3 flex items-center justify-between pl-2">
        <div className="yike-skeleton h-3 w-20" />
        <div className="yike-skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="yike-skeleton mb-2 ml-2 h-5 w-3/4" />
      <div className="yike-skeleton mb-4 ml-2 h-4 w-1/2" />
      <div className="yike-skeleton ml-2 h-8 w-24 rounded-lg" />
    </div>
  );
}
