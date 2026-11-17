"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ADMIN_SHORTCUTS = [
  ["J / K", "上下选卡"],
  ["A", "同意当前审批"],
  ["R", "拒绝当前审批"],
  ["Z", "撤回上一次操作"],
  ["1 - 3", "切换视图"],
  ["Esc", "关闭工作台"],
] as const;

export function HubShortcutHelpPopover({
  open,
  onOpenChange,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div className="hidden sm:flex items-center">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onFocus={() => onOpenChange(true)}
          onBlur={() => onOpenChange(false)}
          className="inline-flex size-7 items-center justify-center rounded-full border border-[#E2E2DF] bg-surface-row-hover text-[12px] font-mono text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#1F1E1D] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413] cursor-pointer"
          aria-label="查看快捷键帮助"
        >
          ?
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className="p-3 text-[12px] shadow-lg border border-[#E2E2DF] bg-white rounded-xl min-w-[200px]"
        >
          <div className="flex flex-col gap-2">
            <div className="text-[#1F1E1D] pb-1 border-b border-border/60">
              键盘快捷键
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-[#78716C]">
              {ADMIN_SHORTCUTS.map(([key, label]) => (
                <div key={key} className="contents">
                  <span className="font-mono text-[#1F1E1D]">{key}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
