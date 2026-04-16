"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnalyticsSection {
  title: string;
  content: ReactNode;
}

export function AnalyticsSections({ sections }: { sections: AnalyticsSection[] }) {
  // 默认展开所有区块以提高信息密度
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    sections.reduce((acc, section) => ({ ...acc, [section.title]: true }), {})
  );

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  const shouldReduceMotion = useReducedMotion();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.1,
        delayChildren: shouldReduceMotion ? 0 : 0.2
      }
    }
  };

  const itemVariants: Variants = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.98 },
    visible: {
      opacity: 1,
      ...(shouldReduceMotion ? {} : { y: 0, scale: 1 }),
      transition: shouldReduceMotion ? { duration: 0.2 } : {
        type: "spring",
        stiffness: 100,
        damping: 20
      }
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      className="space-y-6"
    >
      {sections.map((section, index) => {
        const isExpanded = expandedSections[section.title];
        
        return (
          <motion.div 
            key={section.title} 
            variants={itemVariants}
            className="group"
          >
            <div className={cn(
              "overflow-hidden rounded-[32px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] shadow-sm backdrop-blur-xl transition-all duration-500",
              isExpanded ? "shadow-[0_8px_30px_rgba(0,0,0,0.04)]" : "hover:shadow-md hover:-translate-y-1"
            )}>
              <button 
                onClick={() => toggleSection(section.title)}
                className="flex w-full items-center justify-between px-8 py-6 outline-none"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "flex size-10 items-center justify-center rounded-2xl bg-slate-100/80 font-black text-slate-400 transition-colors duration-300",
                    isExpanded && "bg-blue-50 text-blue-500"
                  )}>
                    {index + 1}
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
                    {section.title}
                  </h2>
                </div>
                
                <div className={cn(
                  "flex size-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-all duration-300 group-hover:bg-slate-100",
                  isExpanded && "rotate-180 bg-blue-50 text-blue-500 group-hover:bg-blue-100"
                )}>
                  <ChevronDown className="size-5" />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ 
                      height: "auto", 
                      opacity: 1,
                      transition: { height: { type: "spring", stiffness: 100, damping: 20 }, opacity: { duration: 0.2, delay: 0.1 } } 
                    }}
                    exit={{ 
                      height: 0, 
                      opacity: 0,
                      transition: { height: { type: "spring", stiffness: 100, damping: 20 }, opacity: { duration: 0.2 } }
                    }}
                  >
                    <div className="border-t border-slate-100/50 px-8 pb-8 pt-6">
                      {section.content}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
