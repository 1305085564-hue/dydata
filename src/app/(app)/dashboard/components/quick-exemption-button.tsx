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
 * - card（默认）：白底 + 描边，与独立按钮同权
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
    "!h-auto !min-h-0 !border-0 !bg-transparent !px-2.5 !py-1.5 !shadow-none gap-2 rounded-lg text-[13px] font-medium text-stone-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:!translate-y-0 hover:!bg-stone-100 hover:!border-0 hover:text-stone-700 focus-visible:bg-stone-100 focus-visible:text-stone-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-900/5 [&>svg]:size-[14px] [&>svg]:text-stone-500 [&>svg]:transition-colors hover:[&>svg]:text-stone-700";
const card =
    "!h-8 !min-h-0 rounded-lg border border-stone-200 bg-white px-2.5 text-[12px] font-medium text-stone-500 transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-stone-900/5";

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
