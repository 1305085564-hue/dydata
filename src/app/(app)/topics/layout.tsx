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
      {/* 顶部标题 */}
      <div className="border-b border-stone-200/80 pb-4">
        <div className="space-y-1">
          <h1 className="text-[24px] font-semibold tracking-tight text-stone-900 flex items-center gap-2">
            <Lightbulb className="size-6 text-[#D97757] stroke-[1.8]" />
            <span>选题库</span>
          </h1>
          <p className="text-[13px] text-stone-500">
            归纳创作灵感，认领并跟进选题制作，沉淀爆款文案。
          </p>
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
