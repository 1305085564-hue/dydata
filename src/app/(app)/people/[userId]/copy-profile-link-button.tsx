"use client";

import { CopyButton } from "@/components/ui/copy-button";

export function CopyProfileLinkButton({ userId }: { userId: string }) {
  return (
    <CopyButton
      getText={() => `${window.location.origin}/people/${userId}`}
      label="复制链接"
      copiedLabel="已复制"
      errorMessage="复制失败，请手动复制浏览器地址栏"
      className="border border-[#E2E2DF] bg-white px-2.5 py-1 text-[#1F1E1D] hover:bg-[#F1F1F0] hover:text-[#141413]"
    />
  );
}
