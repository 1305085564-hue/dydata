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
}

export function CheckpointTracker({ checkpoints, onCheckpointClick, activeId }: CheckpointTrackerProps) {
  return (
    <div className="relative w-full overflow-x-auto">
      <div className="relative grid min-w-[620px] grid-cols-5 gap-2 px-2 py-1.5">
        <div className="absolute left-16 right-16 top-[2.1rem] z-0 h-[2px] bg-zinc-900/15" />

        {checkpoints.map((checkpoint, index) => {
          const isActive = activeId === checkpoint.id;

          return (
            <motion.button
              key={checkpoint.id}
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onCheckpointClick(checkpoint.id)}
              className={cn(
                "group relative z-10 flex min-w-0 items-center gap-3 rounded-[1.25rem] px-3 py-3 text-left outline-none transition-all",
                isActive ? "bg-white/95 shadow-sm ring-1 ring-zinc-200" : "bg-white/40 hover:bg-white/75",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border-2 bg-background text-muted-foreground shadow-sm transition-all duration-300",
                  checkpoint.status === "done" && "border-[#067647] bg-[#067647] text-white shadow-[#D1FADF]",
                  checkpoint.status === "pending" && "animate-pulse border-[#FDE68A] bg-[#FEF9C3] text-[#92400E] shadow-[#FEF9C3]",
                  checkpoint.status === "late" && "border-[#B42318] bg-[#B42318] text-white shadow-[#FEE4E2]",
                  checkpoint.status === "idle" && "border-zinc-200 bg-white/70 text-slate-400 opacity-90",
                  isActive && "border-primary opacity-100 ring-4 ring-zinc-200",
                )}
              >
                {checkpoint.status === "done" ? (
                  <CheckCircle2 className="size-5" />
                ) : checkpoint.status === "late" ? (
                  <AlertCircle className="size-5" />
                ) : checkpoint.isPlaceholder ? (
                  <Lock className="size-4 opacity-50" />
                ) : (
                  <span className="text-sm font-black italic">{index + 1}</span>
                )}
              </div>

              <div className="min-w-0 space-y-0.5">
                <p className={cn("truncate text-[11px] font-black tracking-[0.02em]", isActive ? "text-zinc-900" : "text-slate-500 group-hover:text-slate-700")}>
                  {checkpoint.name}
                </p>
                <div className="flex items-center gap-1.5 text-slate-500 opacity-60">
                  <Clock className="size-3" />
                  <span className="text-[9px] font-bold tabular-nums">{checkpoint.time}</span>
                </div>
              </div>

              {isActive ? (
                <motion.div
                  layoutId="dashboard-active-checkpoint"
                  className="absolute right-3 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-zinc-900 shadow-sm"
                />
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
