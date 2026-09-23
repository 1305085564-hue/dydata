"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Route, Server } from "lucide-react";

export type AIConfigTabKey = "models" | "bindings" | "providers";

const TAB_ITEMS: Array<{ key: "bindings" | "models" | "providers"; label: string; icon: typeof Sparkles }> = [
  { key: "bindings", label: "场景路由", icon: Route },
  { key: "models", label: "模型顺位", icon: Sparkles },
  { key: "providers", label: "渠道密钥", icon: Server },
];

// 三个 Tab 组件的 loader 单独抽出，供 dynamic 与"预热"复用
const loadModels = () => import("./components/models-client");
const loadBindings = () => import("./components/bindings-client");
const loadProviders = () => import("./components/providers-client");

const ModelsClient = dynamic(loadModels, {
  loading: () => <LoadingPlaceholder />,
});

const BindingsClient = dynamic(loadBindings, {
  loading: () => <LoadingPlaceholder />,
});

const ProvidersClient = dynamic(loadProviders, {
  loading: () => <LoadingPlaceholder />,
});

function LoadingPlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-2xl bg-[#FCFCFB]/70 text-[#78716C]">
      <div className="flex items-center gap-3">
        <Skeleton className="size-4 rounded-full" />
      </div>
    </div>
  );
}

export function AIConfigShell({ initialTab }: { initialTab: AIConfigTabKey }) {
  const activeTab = initialTab;

  // 预热三个 Tab 的 JS chunk：切页签时不再空闪占位骨架。
  // 只提前下载组件代码，不提前挂载，因此各 Tab 的数据仍只在真正切到时才各自拉取（不并发拉三份、不把低频设置页做重）。
  useEffect(() => {
    void loadModels();
    void loadBindings();
    void loadProviders();
  }, []);

  return (
    <div className="w-full space-y-5">
      {/* 平铺 Tab 规范 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {TAB_ITEMS.map((tab) => {
            const isActive = tab.key === activeTab;
            const Icon = tab.icon;

            return (
              <Link
                key={tab.key}
                href={`/admin/ai-config?tab=${tab.key}`}
                className={cn(
                  "relative inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all select-none",
                  isActive
                    ? "bg-[#D97757]/10 text-[#D97757] font-medium"
                    : "text-[#292524] hover:text-[#1C1917] hover:bg-[#EBEBE9]"
                )}
              >
                <Icon className={cn("size-3.5", isActive ? "text-[#D97757]" : "text-[#78716C]")} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        {activeTab === "models" && <ModelsClient />}
        {activeTab === "bindings" && <BindingsClient />}
        {activeTab === "providers" && <ProvidersClient />}
      </div>
    </div>
  );
}
