"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { triggerGlobalTopicCreate } from "@/components/topics/global-topic-create";
import { Lightbulb, Plus, BookOpen, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

export default function TopicsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showFloatingText, setShowFloatingText] = useState(false);

  // 滚动时隐藏悬浮文字，保持界面干净
  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingText(false);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const tabs = [
    {
      href: "/topics/today",
      label: "今日选题",
      icon: Compass,
      active: pathname === "/topics/today"
    },
    {
      href: "/topics",
      label: "选题池",
      icon: BookOpen,
      active: pathname === "/topics"
    }
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 顶部标题与二级 Sub-Navigation */}
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-[24px] font-semibold tracking-tight text-stone-900 flex items-center gap-2">
            <Lightbulb className="size-6 text-[#D97757] stroke-[1.8]" />
            <span>选题库</span>
          </h1>
          <p className="text-[13px] text-stone-500">
            归纳创作灵感，认领并跟进选题制作，沉淀爆款文案。
          </p>
        </div>

        {/* 顶部二级 Tabs 和新增按钮 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl bg-stone-100 p-0.5 border border-stone-200/40">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "relative flex h-8 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium transition-all duration-200",
                    tab.active
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-850"
                  )}
                >
                  <TabIcon className={cn("size-3.5", tab.active ? "text-[#D97757]" : "text-stone-400")} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>

          <button
            onClick={() => triggerGlobalTopicCreate()}
            className={cn(
              "flex h-8.5 items-center gap-1.5 rounded-xl border border-transparent bg-[#D97757] px-4 text-[13px] font-medium text-white shadow-sm transition-all duration-200",
              "hover:bg-[#C96442] hover:-translate-y-[1px] active:scale-[0.98] cursor-pointer"
            )}
          >
            <Plus className="size-3.5 stroke-[2]" />
            <span>录入选题</span>
          </button>
        </div>
      </div>

      {/* 主面板页面 */}
      <div className="min-h-[500px]">
        {children}
      </div>

      {/* 全局录入弹窗已上移到 (app)/layout.tsx，任何页面均可触发 */}

      {/* 体验惊喜：右下角极简悬浮动作球 */}
      <motion.button
        layout
        onClick={() => triggerGlobalTopicCreate()}
        onMouseEnter={() => setShowFloatingText(true)}
        onMouseLeave={() => setShowFloatingText(false)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-12 items-center justify-center rounded-full bg-[#D97757] text-white shadow-lg transition-colors hover:bg-[#C96442] cursor-pointer",
          showFloatingText ? "px-4 gap-1.5" : "w-12"
        )}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <Plus className="size-5 stroke-[2.5]" />
        <AnimatePresence>
          {showFloatingText && (
            <motion.span
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden whitespace-nowrap text-[12.5px] font-medium"
            >
              录入新选题
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
