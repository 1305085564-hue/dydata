"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface DashboardAnimatedSectionProps {
  className?: string;
  children: ReactNode;
  index: number;
}

export function DashboardAnimatedSection({ children, index , className }: DashboardAnimatedSectionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div className={className}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay: Math.min(index * 0.04, 0.16), duration: 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
