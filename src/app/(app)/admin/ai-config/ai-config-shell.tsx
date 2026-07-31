"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Sparkles, Route, Server } from "lucide-react";

export type AIConfigTabKey = "models" | "bindings" | "providers" | "rewrite";

const TAB_ITEMS: Array<{ key: "models" | "bindings" | "providers"; label: string; icon: typeof Sparkles }> = [
  { key: "models", label: "模型顺位", icon: Sparkles },
  { key: "bindings", label: "场景路由", icon: Route },
  { key: "providers", label: "渠道密钥", icon: Server },
];

const ModelsClient = dynamic(() => import("./components/models-client"), {
  loading: () => <LoadingPlaceholder />,
});

const BindingsClient = dynamic(() => import("./components/bindings-client"), {
  loading: () => <LoadingPlaceholder />,
});

const ProvidersClient = dynamic(() => import("./components/providers-client"), {
  loading: () => <LoadingPlaceholder />,
});

function LoadingPlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-2xl bg-zinc-50/70 text-zinc-500">
      <div className="flex items-center gap-3">
        <Skeleton className="size-4 rounded-full" />
        <span className="text-[13px]">正在加载模块...</span>
      </div>
    </div>
  );
}

export function AIConfigShell({ initialTab }: { initialTab: AIConfigTabKey }) {
  const activeTab = initialTab === "rewrite" ? "bindings" : initialTab;

  return (
    <div className="w-full space-y-5">
      {/* 编程高级黑 Segmented Control：深度调低至 zinc-800/85，丝滑 Framer Motion 弹簧滑动 */}
      <div className="flex items-center justify-between">
        <div className="relative flex items-center gap-1 rounded-xl bg-zinc-100/80 p-1">
          {TAB_ITEMS.map((tab) => {
            const isActive = tab.key === activeTab;
            const Icon = tab.icon;

            return (
              <Link
                key={tab.key}
                href={`/admin/ai-config?tab=${tab.key}`}
                className={cn(
                  "relative z-10 inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors select-none",
                  isActive ? "text-zinc-100 font-semibold" : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                <Icon className={cn("size-3.5", isActive ? "text-[#D97757]" : "text-zinc-400")} />
                <span>{tab.label}</span>

                {/* 编程高级黑微凸胶囊：zinc-800/85 沉静透黑 + 微柔边框 */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 z-[-1] rounded-lg bg-zinc-800/85 border border-zinc-700/40"
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 32,
                    }}
                  />
                )}
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
