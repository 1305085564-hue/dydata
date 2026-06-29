"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type AIConfigTabKey = "providers" | "bindings" | "rewrite";

const TAB_ITEMS: Array<{ key: AIConfigTabKey; label: string; description: string }> = [
  { key: "providers", label: "供应商管理", description: "配置供应商、API Keys 及可用模型。" },
  { key: "bindings", label: "功能绑定", description: "各个业务功能绑定特定的模型并设置 Prompt。" },
  { key: "rewrite", label: "文案改写模型路由", description: "配置文案改写专用的模型视图与分发路由。" },
];

const ProvidersClient = dynamic(() => import("./components/providers-client"), {
  loading: () => <LoadingPlaceholder />,
});

const BindingsClient = dynamic(() => import("./components/bindings-client"), {
  loading: () => <LoadingPlaceholder />,
});

const RewriteClient = dynamic(() => import("./components/rewrite-client"), {
  loading: () => <LoadingPlaceholder />,
});

function LoadingPlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500">
      <div className="flex items-center gap-3">
        <Skeleton className="size-4 rounded-full" />
        <span className="text-sm">正在加载模块...</span>
      </div>
    </div>
  );
}

export function AIConfigShell({ initialTab }: { initialTab: AIConfigTabKey }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {TAB_ITEMS.map((tab) => {
          const isActive = tab.key === initialTab;
          return (
            <Link
              key={tab.key}
              href={`/admin/ai-config?tab=${tab.key}`}
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

      {initialTab === "providers" && <ProvidersClient />}
      {initialTab === "bindings" && <BindingsClient />}
      {initialTab === "rewrite" && <RewriteClient />}
    </div>
  );
}
