"use client";

import { Users } from "lucide-react";
import { ItemHeading } from "@/components/ui/item-heading";

export function NoTeamPlaceholder() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-[#F1F1F0]">
        <Users className="size-5 text-[#78716C]" />
      </div>
      <ItemHeading as="h2">尚未加入创作团队</ItemHeading>
      <p className="mt-2 text-[14px] leading-6 text-[#78716C]">
        你的账号尚未加入创作团队。团队负责人安排后，即可在此进行日报填报与作品查看。
      </p>
    </div>
  );
}
