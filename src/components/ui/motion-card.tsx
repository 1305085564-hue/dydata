"use client";

import type { ComponentProps, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cardVariants } from "@/lib/animations";
import { Card } from "@/components/ui/card";
import { cardClass } from "@/lib/tailwind-utils";
import { cn } from "@/lib/utils";

interface MotionCardProps extends Omit<ComponentProps<typeof Card>, "children"> {
  children: ReactNode;
  index?: number;
  hover?: boolean;
}

export function MotionCard({ children, className, index = 0, hover = true, ...props }: MotionCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      whileHover={hover && !reduceMotion ? "hover" : undefined}
      variants={cardVariants}
      transition={{ delay: Math.min(index * 0.05, 0.3) }}
    >
      <Card className={cn(cardClass(hover), className)} {...props}>
        {children}
      </Card>
    </motion.div>
  );
}
