"use client";

import { 申请豁免弹窗 } from "../申请豁免弹窗";

interface QuickExemptionButtonProps {
  hasPending: boolean;
  today: string;
  submittedDates: string[];
  initialSelectedDates: string[];
  variant?: "card" | "subtle";
}

/**
 * 顶栏快速豁免按钮
 * - card（默认）：白底 + 描边 + shadow-sm，与独立按钮同权
 * - subtle：无描边无底（hover 才出灰底），与 5 个弱入口同权
 */
export function QuickExemptionButton({
  hasPending,
  today,
  submittedDates,
  initialSelectedDates,
  variant = "card",
}: QuickExemptionButtonProps) {
  const subtle =
    "!h-auto !min-h-0 !border-0 !bg-transparent !px-2 !py-1 !shadow-none gap-1.5 rounded-[8px] text-[12px] font-medium text-zinc-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:!translate-y-0 hover:!bg-zinc-100 hover:!border-0 hover:text-zinc-800 focus-visible:bg-zinc-100 focus-visible:text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5 [&>svg]:size-[13px] [&>svg]:text-zinc-400 [&>svg]:transition-colors hover:[&>svg]:text-zinc-700";
  const card =
    "!h-8 !min-h-0 rounded-[10px] border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-500 shadow-sm transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5";

  return (
    <申请豁免弹窗
      hasPending={hasPending}
      today={today}
      submittedDates={submittedDates}
      initialSelectedDates={initialSelectedDates}
      triggerClassName={variant === "subtle" ? subtle : card}
      triggerVariant="button"
      triggerTitle={hasPending ? "审批中" : "申请豁免"}
    />
  );
}
