"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnalyticsSection {
  id: string;
  title: string;
  content: ReactNode;
}

export function AnalyticsSections({
  sections,
  focusSectionId = null,
}: {
  sections: AnalyticsSection[];
  focusSectionId?: string | null;
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    sections.reduce((acc, section) => ({ ...acc, [section.id]: true }), {}),
  );

  useEffect(() => {
    if (!focusSectionId) return;

    setExpandedSections((prev) => ({
      ...prev,
      [focusSectionId]: true,
    }));

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`analytics-section-${focusSectionId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [focusSectionId]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const shouldReduceMotion = useReducedMotion();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.1,
        delayChildren: shouldReduceMotion ? 0 : 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.98 },
    visible: {
      opacity: 1,
      ...(shouldReduceMotion ? {} : { y: 0, scale: 1 }),
      transition: shouldReduceMotion
        ? { duration: 0.2 }
        : {
            type: "spring",
            stiffness: 100,
            damping: 20,
          },
    },
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
        const isExpanded = expandedSections[section.id];

        return (
          <motion.div
            key={section.id}
            id={`analytics-section-${section.id}`}
            variants={itemVariants}
            className="group"
          >
            <div
              className={cn(
                "overflow-hidden rounded-[32px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] shadow-sm backdrop-blur-xl transition-all duration-500",
                isExpanded ? "shadow-[0_8px_30px_rgba(0,0,0,0.04)]" : "hover:-translate-y-1 hover:shadow-md",
              )}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between px-8 py-6 text-left outline-none"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-2xl bg-slate-100/80 font-black text-slate-400 transition-colors duration-300",
                      isExpanded && "bg-zinc-100 text-zinc-900",
                    )}
                  >
                    {index + 1}
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
                    {section.title}
                  </h2>
                </div>

                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-all duration-300 group-hover:bg-slate-100",
                    isExpanded && "rotate-180 bg-zinc-100 text-zinc-900 group-hover:bg-zinc-200",
                  )}
                >
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
                      transition: {
                        height: { type: "spring", stiffness: 100, damping: 20 },
                        opacity: { duration: 0.2, delay: 0.1 },
                      },
                    }}
                    exit={{
                      height: 0,
                      opacity: 0,
                      transition: {
                        height: { type: "spring", stiffness: 100, damping: 20 },
                        opacity: { duration: 0.2 },
                      },
                    }}
                  >
                    <div className="border-t border-slate-100/50 px-8 pb-8 pt-6">{section.content}</div>
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
