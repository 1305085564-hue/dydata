"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, X } from "lucide-react";
import type { AnomalyStatus } from "@/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AssigneeDisplay } from "../video-submit-form-state";

// 视频状态分段控件
const VIDEO_STATUS_OPTIONS: Array<{
  value: AnomalyStatus;
  label: string;
  tip?: string;
}> = [
  {
    value: "normal",
    label: "正常发布",
  },
  {
    value: "abnormal",
    label: "作品异常",
    tip: "如：账号限流、平台违规删稿等；依然计入当月产量与工作量，请如实录入已产生的数据与平台通知。",
  },
];

export function VideoStatusSegmented({
  value,
  onChange,
}: {
  value: AnomalyStatus;
  onChange: (next: AnomalyStatus) => void;
}) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = VIDEO_STATUS_OPTIONS.findIndex(
      (option) => option.value === value,
    );
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % VIDEO_STATUS_OPTIONS.length
        : (currentIndex - 1 + VIDEO_STATUS_OPTIONS.length) %
          VIDEO_STATUS_OPTIONS.length;
    onChange(VIDEO_STATUS_OPTIONS[nextIndex].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label="视频状态"
      onKeyDown={handleKeyDown}
      className="inline-flex h-7 items-center rounded-md bg-[#F1F1F0] p-0.5"
    >
      {VIDEO_STATUS_OPTIONS.map((option) => {
        const isActive = value === option.value;
        const buttonEl = (
          <button
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            title={option.tip}
            className={cn(
              "inline-flex h-full items-center justify-center rounded-md px-2.5 text-[13px] transition-all cursor-pointer",
              isActive
                ? "bg-white text-[#1F1E1D] shadow-input font-normal"
                : "text-[#78716C] hover:text-[#1F1E1D] font-normal"
            )}
          >
            <span>{option.label}</span>
          </button>
        );

        if (!option.tip) {
          return <span key={option.value}>{buttonEl}</span>;
        }

        return (
          <TooltipProvider key={option.value} delay={150}>
            <Tooltip>
              <TooltipTrigger render={buttonEl} />
              <TooltipContent
                side="top"
                sideOffset={6}
                className="max-w-xs text-[12px] leading-relaxed bg-[#141413] text-white p-2.5 rounded-xl shadow-claude-float border border-[#1F1E1D]"
              >
                {option.tip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

// 岗位选择行组件
export interface RoleItemRowProps {
  label: string;
  display: AssigneeDisplay;
  onOpenSelector: () => void;
  onResetSelf: () => void;
}

export function RoleItemRow({
  label,
  display,
  onOpenSelector,
  onResetSelf,
}: RoleItemRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      {/* 左侧岗位 */}
      <span className="text-[12px] font-normal text-[#78716C] select-none">
        {label}
      </span>

      {/* 右侧人员选择 - 一体化内嵌设计 */}
      <div
        className={cn(
          "group flex h-6 items-center rounded-md transition-all",
          display.external
            ? "bg-status-warning/[0.08] text-status-warning hover:bg-status-warning/[0.12] font-normal"
            : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
        )}
      >
        <button
          type="button"
          onClick={onOpenSelector}
          className={cn(
            "flex h-full items-center gap-1 px-2 text-[12px] font-normal transition-colors cursor-pointer",
            display.historical ? "text-[#78716C]" : display.external ? "text-status-warning" : "text-[#78716C] group-hover:text-[#141413]"
          )}
        >
          <span>{display.text}</span>
          {!display.external && <ChevronDown className="size-3 text-[#A8A29E] transition-colors group-hover:text-[#78716C]" />}
        </button>

        {display.external && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResetSelf();
            }}
            title="恢复由我完成"
            className="flex h-full items-center pr-1.5 pl-0.5 text-status-warning/70 hover:text-status-warning transition-colors cursor-pointer"
          >
            <X className="size-3 stroke-[2]" />
          </button>
        )}
      </div>
    </div>
  );
}
