"use client";

import { cn } from "@/lib/utils";

export interface PoolViewSwitcherProps {
  viewMode: "business" | "supply";
  onChange: (mode: "business" | "supply") => void;
}

export function PoolViewSwitcher({ viewMode, onChange }: PoolViewSwitcherProps) {
  return (
    <div className="inline-flex items-center gap-1 shrink-0" role="tablist" aria-label="算力视角切换">
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "business"}
        aria-label="切换至业务保障"
        onClick={() => onChange("business")}
        className={cn(
          "text-[12px] px-2.5 py-1 rounded-md transition-colors cursor-pointer",
          viewMode === "business"
            ? "bg-[#EBEBE9] text-[#141413] font-medium"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#F1F1F0] font-normal"
        )}
      >
        业务保障
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "supply"}
        aria-label="切换至供给管理"
        onClick={() => onChange("supply")}
        className={cn(
          "text-[12px] px-2.5 py-1 rounded-md transition-colors cursor-pointer",
          viewMode === "supply"
            ? "bg-[#EBEBE9] text-[#141413] font-medium"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#F1F1F0] font-normal"
        )}
      >
        供给管理
      </button>
    </div>
  );
}
