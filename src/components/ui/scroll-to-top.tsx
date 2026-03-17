"use client";

import { AnimatePresence, motion, useScroll } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

export function ScrollToTop() {
  const { scrollY } = useScroll();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = scrollY.on("change", (latest) => {
      setIsVisible(latest > 400);
    });

    return unsubscribe;
  }, [scrollY]);

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.button
          key="scroll-to-top"
          type="button"
          aria-label="回到顶部"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          initial={{ opacity: 0, scale: 0.82, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.82, y: 14 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="glass-card-static fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/75 text-foreground shadow-[var(--shadow-medium)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-heavy)] dark:border-white/10 dark:bg-slate-950/75 sm:right-6 sm:bottom-6"
        >
          <ArrowUp className="size-4" />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
