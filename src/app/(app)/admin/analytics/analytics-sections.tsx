"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardAnimatedSection } from "../../dashboard/dashboard-animated-section";

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
};

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
          <DashboardAnimatedSection index={index}>
            <Card className="glass-card-static border-white/60 bg-white/70">
              <CardHeader>
                <CardTitle className="font-semibold tracking-tight">{section.title}</CardTitle>
              </CardHeader>
              <CardContent>{section.content}</CardContent>
            </Card>
          </DashboardAnimatedSection>
        </motion.div>
      ))}
    </motion.div>
  );
}
