"use client";

import { Users } from "lucide-react";
import { ItemHeading } from "@/components/ui/item-heading";

export function NoTeamPlaceholder() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-[#F1F1F0]">
        <Users className="size-5 text-[#78716C]" />
      </div>
      <ItemHeading as="h2">静候团队接引</ItemHeading>
      <p className="mt-2 text-[13px] leading-6 text-[#78716C]">
        你的账号还未加入任何创作团队，暂时无法提交数据。请联系管理员或组长将你拉入团队后再回到本页。
      </p>
    </div>
  );
}
