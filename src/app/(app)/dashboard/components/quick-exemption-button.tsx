"use client";

import { 申请豁免弹窗 } from "../申请豁免弹窗";

interface QuickExemptionButtonProps {
  hasPending: boolean;
  today: string;
  submittedDates: string[];
  initialSelectedDates: string[];
}

/**
 * 顶栏快速豁免按钮
 * 法典 V1：与其他 utility action 视觉等高、等权
 */
export function QuickExemptionButton({
  hasPending,
  today,
  submittedDates,
  initialSelectedDates,
}: QuickExemptionButtonProps) {
  return (
    <申请豁免弹窗
      hasPending={hasPending}
      today={today}
      submittedDates={submittedDates}
      initialSelectedDates={initialSelectedDates}
      triggerClassName="!h-8 !min-h-0 rounded-[10px] border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-500 shadow-sm transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
      triggerVariant="button"
      triggerTitle={hasPending ? "审批中" : "申请豁免"}
    />
  );
}
