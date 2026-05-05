"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.1, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
