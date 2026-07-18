"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsVisible(window.scrollY > 400);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      aria-label="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="animate-in fade-in slide-in-from-bottom-2 fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-white hover:text-stone-700 active:translate-y-0 sm:right-6 sm:bottom-6"
    >
      <ArrowUp className="size-4 stroke-[1.5]" />
    </button>
  );
}
