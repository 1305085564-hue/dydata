"use client";

import { AlertCircle, CheckCircle2, Clock, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type CheckpointStatus = "idle" | "pending" | "done" | "late";

export interface Checkpoint {
  id: number;
  name: string;
  time: string;
  status: CheckpointStatus;
  isPlaceholder?: boolean;
}

interface CheckpointTrackerProps {
  checkpoints: Checkpoint[];
  onCheckpointClick: (id: number) => void;
  activeId?: number;
  orientation?: "horizontal" | "vertical";
}

export function CheckpointTracker({ checkpoints, onCheckpointClick, activeId, orientation = "horizontal" }: CheckpointTrackerProps) {
  if (orientation === "vertical") {
    return (
      <div className="relative flex flex-col gap-4">
        {checkpoints.map((checkpoint, index) => {
          const isActive = activeId === checkpoint.id;

          return (
            <button
              key={checkpoint.id}
              type="button"
              onClick={() => onCheckpointClick(checkpoint.id)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl p-2.5 text-left transition-all duration-200",
                isActive ? "bg-stone-50 border border-stone-200/60 shadow-sm" : "hover:bg-stone-50/50"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white text-stone-400 transition-colors",
                  checkpoint.status === "done" && "border-[#6FAA7D] bg-[#6FAA7D] text-white",
                  checkpoint.status === "pending" && "border-[#D99E55] bg-white text-[#D99E55]",
                  checkpoint.status === "late" && "border-[#C9604D] bg-[#C9604D] text-white",
                  checkpoint.status === "idle" && "border-stone-200 bg-white text-stone-400",
                )}
              >
                {checkpoint.status === "done" ? (
                  <CheckCircle2 className="size-4 stroke-[1.5]" />
                ) : checkpoint.status === "late" ? (
                  <AlertCircle className="size-4 stroke-[1.5]" />
                ) : checkpoint.isPlaceholder ? (
                  <Lock className="size-3 stroke-[1.5] opacity-50" />
                ) : (
                  <span className="text-xs font-semibold font-mono tabular-nums">{index + 1}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-stone-700">{checkpoint.name}</p>
                <p className="text-[10px] text-stone-400 font-mono">{checkpoint.time}</p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-x-auto">
      <div className="relative grid min-w-[620px] grid-cols-5 gap-2 px-2 py-1.5">
        <div className="absolute left-16 right-16 top-[2.1rem] z-0 h-[1px] bg-stone-200" />

        {checkpoints.map((checkpoint, index) => {
          const isActive = activeId === checkpoint.id;

          return (
            <motion.button
              key={checkpoint.id}
              type="button"
              onClick={() => onCheckpointClick(checkpoint.id)}
              className={cn(
                "group relative z-10 flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left outline-none transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] active:translate-y-0 focus-visible:ring-1 focus-visible:ring-stone-950/5",
                isActive ? "bg-white shadow-sm ring-1 ring-stone-200" : "bg-white/70 hover:bg-white",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white text-stone-400 transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  checkpoint.status === "done" && "border-[#6FAA7D] bg-[#6FAA7D] text-white",
                  checkpoint.status === "pending" && "border-[#D99E55] bg-white text-[#D99E55]",
                  checkpoint.status === "late" && "border-[#C9604D] bg-[#C9604D] text-white",
                  checkpoint.status === "idle" && "border-stone-200 bg-white text-stone-400",
                  isActive && "ring-1 ring-stone-950/5",
                )}
              >
                {checkpoint.status === "done" ? (
                  <CheckCircle2 className="size-5 stroke-[1.5]" />
                ) : checkpoint.status === "late" ? (
                  <AlertCircle className="size-5 stroke-[1.5]" />
                ) : checkpoint.isPlaceholder ? (
                  <Lock className="size-4 stroke-[1.5] opacity-50" />
                ) : (
                  <span className="text-sm font-semibold font-mono tabular-nums">{index + 1}</span>
                )}
              </div>

              <div className="min-w-0 space-y-0.5">
                <p
                  className={cn(
                    "truncate text-[11px] font-medium tracking-[0.02em]",
                    isActive ? "text-stone-800" : "text-stone-500 group-hover:text-stone-800",
                  )}
                >
                  {checkpoint.name}
                </p>
                <div className="flex items-center gap-1.5 text-stone-400">
                  <Clock className="size-3 stroke-[1.5]" />
                  <span className="text-[12px] font-medium font-mono tabular-nums">{checkpoint.time}</span>
                </div>
              </div>

              {isActive ? (
                <motion.div
                  layoutId="dashboard-active-checkpoint"
                  className="absolute right-3 top-2 h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white"
                />
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
