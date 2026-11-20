"use client";

import { cn } from "@/lib/utils";

export type PoolViewMode = "model" | "channel";

export interface PoolViewSwitcherProps {
  viewMode: PoolViewMode;
  onChange: (mode: PoolViewMode) => void;
}

/** 分段控件：和右边的「在用 / 要处理 / 全部」同一个样子，激活为白底 */
export const SEGMENT_TRACK = "inline-flex items-center p-0.5 rounded-md bg-[#F1F1F0] text-[12px] shrink-0";

export function segmentClass(active: boolean) {
  return cn(
    "px-3 py-1 rounded-md transition-colors text-[12px] cursor-pointer",
    active ? "bg-white text-[#141413] shadow-input" : "text-[#78716C] hover:text-[#141413]",
  );
}

const VIEWS: Array<{ mode: PoolViewMode; label: string; aria: string }> = [
  { mode: "model", label: "模型视角", aria: "切换至模型视角" },
  { mode: "channel", label: "渠道视角", aria: "切换至渠道视角" },
];

export function PoolViewSwitcher({ viewMode, onChange }: PoolViewSwitcherProps) {
  return (
    <div className={SEGMENT_TRACK} role="tablist" aria-label="算力底座视角切换">
      {VIEWS.map((view) => (
        <button
          key={view.mode}
          type="button"
          role="tab"
          aria-selected={viewMode === view.mode}
          aria-label={view.aria}
          onClick={() => onChange(view.mode)}
          className={segmentClass(viewMode === view.mode)}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
