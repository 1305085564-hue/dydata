"use client";

import { cn } from "@/lib/utils";

export type PoolViewMode = "model" | "channel";

export interface PoolViewSwitcherProps {
  viewMode: PoolViewMode;
  onChange: (mode: PoolViewMode) => void;
}

export function PoolViewSwitcher({ viewMode, onChange }: PoolViewSwitcherProps) {
  return (
    <div className="inline-flex items-center gap-1 shrink-0" role="tablist" aria-label="算力底座视角切换">
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "model"}
        aria-label="切换至模型视角"
        onClick={() => onChange("model")}
        className={cn(
          "text-[12px] px-2.5 py-1 rounded-md transition-colors cursor-pointer",
          viewMode === "model"
            ? "bg-[#EBEBE9] text-[#141413] font-medium"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#F1F1F0] font-normal"
        )}
      >
        模型视角
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "channel"}
        aria-label="切换至渠道视角"
        onClick={() => onChange("channel")}
        className={cn(
          "text-[12px] px-2.5 py-1 rounded-md transition-colors cursor-pointer",
          viewMode === "channel"
            ? "bg-[#EBEBE9] text-[#141413] font-medium"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#F1F1F0] font-normal"
        )}
      >
        渠道视角
      </button>
    </div>
  );
}
