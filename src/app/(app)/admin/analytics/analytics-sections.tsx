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
                "overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                !isExpanded && "hover:-translate-y-[1px] active:translate-y-0",
              )}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between px-6 py-5 text-left outline-none"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-lg bg-zinc-100 text-[13px] font-medium text-zinc-400 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] font-mono tabular-nums",
                      isExpanded && "bg-zinc-100 text-zinc-800",
                    )}
                  >
                    {index + 1}
                  </div>
                  <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">
                    {section.title}
                  </h2>
                </div>

                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full bg-zinc-50 text-zinc-400 transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:bg-zinc-100",
                    isExpanded && "rotate-180 bg-zinc-100 text-zinc-800 group-hover:bg-zinc-200",
                  )}
                >
                  <ChevronDown className="size-5 stroke-[1.5]" />
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
                    <div className="border-t border-zinc-100 px-6 pb-6 pt-5">{section.content}</div>
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
