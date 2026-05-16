"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import AIChannelsClient from "./ai-channels-client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type AIConfigTabKey = "channels" | "rewrite";

const AIRewriteClient = dynamic(() => import("../ai-rewrite/ai-rewrite-client"), {
  loading: () => (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-sm text-zinc-500">
      <Skeleton className="size-4 rounded-full" />
      正在加载文案改写...
    </div>
  ),
});

const TAB_ITEMS: Array<{ key: AIConfigTabKey; label: string; description: string }> = [
  { key: "channels", label: "渠道配置", description: "管理渠道、启停、恢复与功能绑定。" },
  { key: "rewrite", label: "文案改写", description: "只在需要时加载改写配置，避免拖慢渠道页首屏。" },
];

export function AIConfigShell({ initialTab }: { initialTab: AIConfigTabKey }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {TAB_ITEMS.map((tab) => {
          const isActive = tab.key === initialTab;
          return (
            <Link
              key={tab.key}
              href={`/admin/ai-channels?tab=${tab.key}`}
              className={cn(
                "inline-flex items-center rounded-xl border px-4 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-[#D97757]/40 bg-[#D97757]/8 text-[#D97757]"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[12px] text-zinc-500">
        {TAB_ITEMS.find((tab) => tab.key === initialTab)?.description}
      </div>

      {initialTab === "rewrite" ? <AIRewriteClient /> : <AIChannelsClient />}
    </div>
  );
}
