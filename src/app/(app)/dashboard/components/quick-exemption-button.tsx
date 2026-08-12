"use client";

import { 申请豁免弹窗 } from "../申请豁免弹窗";

interface QuickExemptionButtonProps {
  hasPending: boolean;
  today: string;
  submittedDates: string[];
  pendingDates?: string[];
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
  pendingDates = [],
  initialSelectedDates,
  variant = "card",
}: QuickExemptionButtonProps) {
  const subtlePending =
    "!h-auto !min-h-0 !border-0 !bg-zinc-100/60 !px-2.5 !py-1.5 !shadow-none gap-2 rounded-lg text-[13px] font-medium text-zinc-600 transition-all duration-150 ease-out hover:!bg-zinc-100/80 [&>svg]:size-[14px] [&>svg]:text-[#F59E0B] [&>svg]:animate-pulse";
  const subtle =
    "!h-auto !min-h-0 !border-0 !bg-transparent !px-2.5 !py-1.5 !shadow-none gap-2 rounded-lg text-[13px] font-medium text-zinc-500 transition-all duration-150 ease-out hover:!bg-zinc-100 hover:!border-0 hover:text-zinc-950 focus-visible:bg-zinc-100 focus-visible:text-zinc-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900/5 [&>svg]:size-[14px] [&>svg]:text-zinc-500 [&>svg]:transition-colors hover:[&>svg]:text-zinc-700";
  const cardPending =
    "!h-8 !min-h-0 rounded-lg border border-zinc-200/80 bg-zinc-100/70 px-2.5 text-[12px] font-medium text-zinc-600 transition-all duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-950 active:scale-95 [&>svg]:text-[#F59E0B] [&>svg]:animate-pulse";
  const card =
    "!h-8 !min-h-0 rounded-lg border border-zinc-200 bg-white px-2.5 text-[12px] font-medium text-zinc-600 transition-all duration-150 ease-out hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 active:scale-95 focus-visible:ring-1 focus-visible:ring-zinc-900/5";

  const resolvedPendingDates =
    pendingDates.length > 0 ? pendingDates : hasPending ? [today] : [];

  return (
    <申请豁免弹窗
      hasPending={hasPending}
      today={today}
      submittedDates={submittedDates}
      pendingDates={resolvedPendingDates}
      initialSelectedDates={initialSelectedDates}
      triggerClassName={
        hasPending
          ? variant === "subtle"
            ? subtlePending
            : cardPending
          : variant === "subtle"
            ? subtle
            : card
      }
      triggerVariant="button"
      triggerTitle={hasPending ? "申请审批中" : "申请豁免"}
    />
  );
}
