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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:bg-white hover:text-zinc-800 hover:shadow-sm active:translate-y-0 sm:right-6 sm:bottom-6"
        >
          <ArrowUp className="size-4 stroke-[1.5]" />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
