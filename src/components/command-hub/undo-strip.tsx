"use client";

import { RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { ActiveUndoItem } from "@/lib/command-hub/types";

export function UndoStrip({
  activeUndoList,
  handleUndo,
}: {
  activeUndoList: ActiveUndoItem[];
  handleUndo: (undoId: string) => void;
}) {
  return (
    <>
{/* Top Pinned Undo Notification Strip (顶部非阻断撤回状态条，绝不遮挡底部卡片) */}
<AnimatePresence>
  {activeUndoList.length > 0 && (
    <motion.div
      key="undo-banner-top"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="shrink-0 overflow-hidden border-b border-[#E2E2DF]/60 bg-white px-5 sm:px-6"
    >
      <div className="py-2 space-y-1">
        {activeUndoList.map((activeUndo) => (
          <div key={activeUndo.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[#78716C] text-[12px]">✦</span>
              <span className="truncate text-[12px] font-normal text-[#141413]">
                {activeUndo.action === "approved" ? "已同意" : "已拒绝"} {activeUndo.title}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleUndo(activeUndo.id)}
              className="inline-flex items-center gap-1 shrink-0 rounded-md bg-white border border-[#E2E2DF] hover:bg-[#EBEBE9] px-2.5 py-0.5 text-[12px] font-normal text-[#1F1E1D] shadow-input transition-colors cursor-pointer"
            >
              <RotateCcw className="size-3 text-[#78716C]" />
              <span>撤回 ({activeUndo.remainingSeconds}s)</span>
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  )}
</AnimatePresence>
    </>
  );
}
