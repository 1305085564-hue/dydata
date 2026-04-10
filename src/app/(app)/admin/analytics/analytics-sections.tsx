"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/ui/motion-card";
import { containerVariants, itemVariants } from "@/lib/animations";

export interface AnalyticsSection {
  title: string;
  content: ReactNode;
}

export function AnalyticsSections({ sections }: { sections: AnalyticsSection[] }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      className="space-y-8"
    >
      {sections.map((section, index) => (
        <motion.div key={section.title} variants={itemVariants}>
          <MotionCard
            index={index}
            hover={false}
            className="rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(246,249,255,0.86))] shadow-[var(--shadow-card)] backdrop-blur-[18px]"
          >
            <CardHeader className="px-6 pb-3 pt-6">
              <CardTitle className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">{section.content}</CardContent>
          </MotionCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
