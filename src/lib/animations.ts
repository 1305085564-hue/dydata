"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Variants } from "framer-motion";

export const ANIMATION_TIMINGS = {
  micro: 150,
  fast: 250,
  normal: 350,
  slow: 500,
  number: 600,
} as const;

const DEFAULT_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1];
export const SPRING_EASE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

export const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: ANIMATION_TIMINGS.normal / 1000,
      ease: DEFAULT_EASE,
    },
  },
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    boxShadow: "var(--shadow-card)",
    transition: {
      duration: ANIMATION_TIMINGS.normal / 1000,
      ease: DEFAULT_EASE,
    },
  },
  hover: {
    y: -2,
    boxShadow: "var(--shadow-card-hover)",
    transition: {
      duration: ANIMATION_TIMINGS.fast / 1000,
      ease: SPRING_EASE,
    },
  },
};

export const toastVariants: Variants = {
  initial: {
    opacity: 0,
    y: 12,
    scale: 0.98,
    filter: "blur(8px)",
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: ANIMATION_TIMINGS.fast / 1000,
      ease: DEFAULT_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.96,
    transition: {
      duration: ANIMATION_TIMINGS.micro / 1000,
      ease: EXIT_EASE,
    },
  },
};

export const modalVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.96,
    filter: "blur(10px)",
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: ANIMATION_TIMINGS.normal / 1000,
      ease: DEFAULT_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: 12,
    scale: 0.98,
    transition: {
      duration: ANIMATION_TIMINGS.fast / 1000,
      ease: EXIT_EASE,
    },
  },
};

export const barVariants: Variants = {
  hidden: { opacity: 0, scaleX: 0, transformOrigin: "left center" },
  visible: {
    opacity: 1,
    scaleX: 1,
    transformOrigin: "left center",
    transition: {
      duration: ANIMATION_TIMINGS.number / 1000,
      ease: DEFAULT_EASE,
    },
  },
};

export const shakeVariants: Variants = {
  initial: { x: 0 },
  animate: {
    x: [0, -4, 4, -4, 4, -4, 4, 0],
    transition: {
      duration: 0.2,
      ease: "easeInOut",
      times: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 0.92, 1],
    },
  },
};

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function usePrefersReducedMotion() {
  const isHydrated = useHydrated();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [isHydrated]);

  return reduced;
}

export interface CountUpFormatOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  compactThreshold?: number;
  compactDivisor?: number;
  compactSuffix?: string;
}

const defaultFormatOptions: Required<CountUpFormatOptions> = {
  locale: "zh-CN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  compactThreshold: Number.POSITIVE_INFINITY,
  compactDivisor: 10000,
  compactSuffix: "万",
};

export function formatCountUpValue(value: number, options: CountUpFormatOptions = {}) {
  const merged = { ...defaultFormatOptions, ...options };

  if (Math.abs(value) >= merged.compactThreshold) {
    const compactValue = value / merged.compactDivisor;
    const compact = new Intl.NumberFormat(merged.locale, {
      minimumFractionDigits: merged.minimumFractionDigits,
      maximumFractionDigits: merged.maximumFractionDigits,
    }).format(compactValue);

    return `${compact}${merged.compactSuffix}`;
  }

  return new Intl.NumberFormat(merged.locale, {
    minimumFractionDigits: merged.minimumFractionDigits,
    maximumFractionDigits: merged.maximumFractionDigits,
  }).format(value);
}

interface UseCountUpOptions extends CountUpFormatOptions {
  start?: number;
}

export function useCountUp(target: number, duration = ANIMATION_TIMINGS.number, startOnMount = true, options: UseCountUpOptions = {}) {
  const isHydrated = useHydrated();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(startOnMount ? options.start ?? 0 : target);
  const frameRef = useRef<number | null>(null);
  const previousTargetRef = useRef(startOnMount ? options.start ?? 0 : target);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const from = hasStartedRef.current ? previousTargetRef.current : options.start ?? 0;
    const to = target;
    previousTargetRef.current = to;

    if (!startOnMount && !hasStartedRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(to);
      hasStartedRef.current = true;
      return;
    }

    if (prefersReducedMotion || duration <= 0 || from === to) {
      setValue(to);
      hasStartedRef.current = true;
      return;
    }

    const startTime = performance.now();
    hasStartedRef.current = true;

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (to - from) * eased);

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [duration, isHydrated, options.start, prefersReducedMotion, startOnMount, target]);

  const formattedValue = useMemo(() => formatCountUpValue(value, options), [options, value]);

  return {
    value,
    formattedValue,
  };
}

export const typewriterCursorClassName = "typewriter-cursor";

export function useTypewriter(text: string, speed = 25) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayText, setDisplayText] = useState(prefersReducedMotion ? text : "");
  const [isComplete, setIsComplete] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayText(text);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsComplete(true);
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayText("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsComplete(text.length === 0);

    if (text.length === 0) {
      return;
    }

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setDisplayText(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
        setIsComplete(true);
      }
    }, speed);

    return () => window.clearInterval(timer);
  }, [prefersReducedMotion, speed, text]);

  return {
    displayText,
    isComplete,
    cursorClassName: typewriterCursorClassName,
  };
}
