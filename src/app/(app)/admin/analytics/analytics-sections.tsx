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
          <MotionCard index={index} hover={false} className="border-white/60 bg-white/75">
            <CardHeader>
              <CardTitle className="font-semibold tracking-tight text-[var(--color-text-primary)]">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>{section.content}</CardContent>
          </MotionCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
