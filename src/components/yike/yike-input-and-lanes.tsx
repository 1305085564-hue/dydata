"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2, Send } from "lucide-react";
import { motion } from "framer-motion";
import type { YikeItemStatus, YikeLane } from "./types";
import { STATUS_LABELS } from "./types";
import { LaneCard, LoadingSlot } from "./yike-cards";

const MAX_RAW_INPUT_LENGTH = 2000;

export function QuickInput({
  onSubmit,
  isLoading,
}: {
  onSubmit?: (text: string) => void;
  isLoading?: boolean;
}) {
  const [text, setText] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    onSubmit?.(text.trim().slice(0, MAX_RAW_INPUT_LENGTH));
    setText("");
  };

  const overLimit = text.length > MAX_RAW_INPUT_LENGTH;

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1], delay: 0.06 }}
      className={cn(
        "yike-quick-input relative rounded-2xl px-5 py-4 transition-colors duration-200",
        isLoading && "bg-zinc-50/80",
        overLimit && "border-[#C9604D]/40"
      )}
    >
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={isLoading}
          placeholder="把脑子里的下一件事丢进来…"
          maxLength={MAX_RAW_INPUT_LENGTH + 100}
          className="flex-1 bg-transparent text-[15px] leading-[1.7] text-zinc-800 placeholder:text-zinc-400 outline-none disabled:cursor-not-allowed"
        />
        <motion.button
          type="submit"
          disabled={!text.trim() || isLoading || overLimit}
          whileHover={{ scale: text.trim() && !isLoading && !overLimit ? 1.05 : 1 }}
          whileTap={{ scale: text.trim() && !isLoading && !overLimit ? 0.95 : 1 }}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
            text.trim() && !isLoading && !overLimit
              ? "bg-[#D97757] text-white hover:bg-[#C96442] active:bg-[#B8532E]"
              : "bg-zinc-100 text-zinc-300"
          )}
          aria-label="创建"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </motion.button>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-5 right-5 h-px bg-zinc-100">
        <motion.div
          className={cn("h-full", overLimit ? "bg-[#C9604D]" : "bg-[#D97757]")}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: focused || overLimit ? 1 : 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          style={{ originX: 0 }}
        />
      </div>
      <motion.div
        initial={false}
        animate={{
          opacity: focused || text.length > 0 ? 1 : 0,
          y: focused || text.length > 0 ? 0 : 4,
        }}
        className="mt-1.5 flex justify-end text-[11px] tabular-nums"
      >
        <span className={cn(overLimit && "text-[#C9604D]")}>
          {text.length}/{MAX_RAW_INPUT_LENGTH}
        </span>
      </motion.div>
    </motion.form>
  );
}

const LANE_ORDER: YikeItemStatus[] = ["planned", "doing", "delegated", "done"];

const laneColClass: Record<YikeItemStatus, string> = {
  planned: "lg:col-span-1",
  doing: "lg:col-span-1",
  delegated: "lg:col-span-1",
  done: "lg:col-span-1",
};

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.08,
    },
  },
};

interface StatusLanesProps {
  lanes: Record<YikeItemStatus, YikeLane>;
  onTransition?: (itemId: string, target: YikeItemStatus) => void;
  transitioningId?: string | null;
}

export function StatusLanes({ lanes, onTransition, transitioningId }: StatusLanesProps) {
  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-6 lg:grid-cols-[1.25fr_1fr_1fr_0.9fr]"
    >
      {LANE_ORDER.map((status) => {
        const lane = lanes[status];
        return (
          <div key={status} className={cn("flex flex-col gap-2", laneColClass[status])}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="yike-lane-title text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {STATUS_LABELS[status]}
                </span>
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-400">
                  {lane.items.length}
                </span>
              </div>
              {lane.hiddenCount > 0 && (
                <span className="text-[11px] text-zinc-400">+{lane.hiddenCount} 隐藏</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {lane.items.map((item) => (
                <LaneCard
                  key={item.id}
                  item={item}
                  onTransition={onTransition}
                  transitioning={transitioningId === item.id}
                />
              ))}
              {lane.items.length === 0 && (
                <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-5 text-center text-[12px] text-zinc-300"
                >
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </motion.section>
  );
}

export function StatusLanesSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr_1fr_0.9fr]">
      {LANE_ORDER.map((status) => (
        <div key={status} className="flex flex-col gap-2">
          <div className="yike-skeleton h-4 w-16" />
          <div className="flex flex-col gap-1.5">
            <LoadingSlot lines={2} />
            <LoadingSlot lines={1} />
          </div>
        </div>
      ))}
    </div>
  );
}
