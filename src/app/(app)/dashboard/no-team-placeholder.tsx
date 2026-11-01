"use client";

import { Users } from "lucide-react";
import { ItemHeading } from "@/components/ui/item-heading";

export function NoTeamPlaceholder() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-[#F1F1F0]">
        <Users className="size-5 text-[#78716C]" />
      </div>
      <ItemHeading as="h2">静候同行伙伴</ItemHeading>
      <p className="mt-2 text-[14px] leading-6 text-[#78716C]">
        你的账号尚未归属创作团队，暂未开启填报。待管理员或组长为你安排小队后，便可在此从容落笔。
      </p>
    </div>
  );
}
