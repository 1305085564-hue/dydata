"use client";

import { ROLE_ZERO_OUTPUT_RULE_TEXT, type TabKey } from "@/lib/collaboration/domain/workbench-state";

export function SelfMemberBadge() {
  return (
    <span className="ml-1 inline-flex items-center rounded-md bg-[#F1F1F0] px-1.5 py-0 text-[12px] font-normal text-[#78716C] shrink-0">
      我
    </span>
  );
}

export function MemberZeroOutputBanner({ tab }: { tab: TabKey }) {
  return (
    <div
      role="status"
      className="rounded-xl bg-[#F1F1F0] px-3 py-2 text-[13px] text-[#1F1E1D]"
    >
      {ROLE_ZERO_OUTPUT_RULE_TEXT[tab]}
    </div>
  );
}
