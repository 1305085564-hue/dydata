"use client";

import { triggerGlobalTopicCreate } from "@/components/topics/global-topic-create";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

export default function TopicsLayout({ children }: { children: React.ReactNode }) {
  const [showFloatingText, setShowFloatingText] = useState(false);

  // 滚动时隐藏悬浮文字，保持界面干净
  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingText(false);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pt-2 sm:pt-4">
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
