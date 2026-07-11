"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  className?: string;
  duration?: number;
  format?: (n: number) => string;
}

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function AnimatedNumber({
  value,
  className = "",
  duration = 0.6,
  format = defaultFormat,
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const isHydrated = useHydrated();
  const motionValue = useMotionValue(0);
  const previousValueRef = useRef(0);
  const display = useTransform(motionValue, (latest) => format(Math.round(latest)));
  const fallbackDisplay = useMemo(() => format(value), [format, value]);
  const animationDuration = duration > 10 ? duration / 1000 : duration;

  useEffect(() => {
    if (!isHydrated) return;

    const previousValue = previousValueRef.current;
    previousValueRef.current = value;

    if (reduceMotion || previousValue === value) {
      motionValue.set(value);
      return;
    }

    motionValue.set(previousValue);
    const controls = animate(motionValue, value, {
      duration: animationDuration,
      ease: [0.22, 1, 0.36, 1],
    });

    return () => {
      controls.stop();
    };
  }, [animationDuration, isHydrated, motionValue, reduceMotion, value]);

  return <motion.span className={`tabular-nums ${className}`}>{isHydrated ? display : fallbackDisplay}</motion.span>;
}

function defaultFormat(value: number) {
  return value.toLocaleString("zh-CN");
}
