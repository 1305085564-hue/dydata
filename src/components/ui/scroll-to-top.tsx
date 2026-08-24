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
      className="animate-in fade-in slide-in-from-bottom-2 fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E0D6] bg-[#FBF9F5]/90 backdrop-blur-md text-[#78716C] shadow-claude-float transition-all duration-150 hover:bg-[#F5F3EE] hover:text-[#292524] active:scale-[0.985] active:duration-75 sm:right-6 sm:bottom-6"
    >
      <ArrowUp className="size-4 stroke-[1.5]" />
    </button>
  );
}
