"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyProfileLinkButton({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const url = `${window.location.origin}/people/${userId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("已复制成员主页链接");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动复制浏览器地址栏");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-[#E2E2DF] bg-white px-2.5 py-1 text-[12px] font-normal text-[#1F1E1D] transition-colors hover:bg-[#F1F1F0] hover:text-[#141413] cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-[#D97757]" />
          <span className="text-[#D97757]">已复制链接</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5 text-[#78716C]" />
          <span>复制链接</span>
        </>
      )}
    </button>
  );
}
