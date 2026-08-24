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
    "!h-auto !min-h-0 !border-0 !bg-[#F5F3EE]/60 !px-2.5 !py-1.5 !shadow-none gap-2 rounded-lg text-[13px] font-medium text-[#292524] transition-colors duration-100 ease-out hover:!bg-[#F5F3EE]/80 [&>svg]:size-[14px] [&>svg]:text-[#D99E55] [&>svg]:animate-pulse";
  const subtle =
    "!h-auto !min-h-0 !border-0 !bg-transparent !px-2.5 !py-1.5 !shadow-none gap-2 rounded-lg text-[13px] font-medium text-[#78716C] transition-colors duration-100 ease-out hover:!bg-[#F5F3EE] hover:!border-0 hover:text-[#1C1917] focus-visible:bg-[#F5F3EE] focus-visible:text-[#1C1917] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1C1917]/5 [&>svg]:size-[14px] [&>svg]:text-[#78716C] [&>svg]:transition-colors hover:[&>svg]:text-[#292524]";
  const cardPending =
    "!h-8 !min-h-0 rounded-lg border border-[#E5E0D6]/80 bg-[#F5F3EE]/70 px-2.5 text-[12px] font-medium text-[#292524] transition-colors duration-100 ease-out hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.985] active:duration-75 [&>svg]:text-[#D99E55] [&>svg]:animate-pulse";
  const card =
    "!h-8 !min-h-0 rounded-lg border border-[#E5E0D6] bg-white px-2.5 text-[12px] font-medium text-[#292524] transition-colors duration-100 ease-out hover:border-[#E5E0D6] hover:bg-[#FBF9F5] hover:text-[#1C1917] active:scale-[0.985] active:duration-75 focus-visible:ring-1 focus-visible:ring-[#1C1917]/5";

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
