"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-center gap-3 bg-[#D99E55] px-4 text-[13px] font-medium text-[#27272A]">
      <span>演示模式 — 所有数据为模拟数据，不可提交</span>
      <Link
        href="/login"
        className="active:translate-y-0 inline-flex items-center gap-1 rounded-full bg-[#27272A]/10 px-2.5 py-0.5 text-[12px] transition-[background-color] duration-150 hover:bg-[#27272A]/20"
      >
        <LogOut className="size-3" />
        退出演示
      </Link>
    </div>
  );
}
