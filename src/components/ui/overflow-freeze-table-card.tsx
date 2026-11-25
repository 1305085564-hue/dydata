"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 横向溢出感知表格卡片：仅当容器实际发生横向溢出（scrollWidth > clientWidth + 1）时，
 * 标记 `data-overflow-x="true"` 并冻结首列；宽屏能完整放下时保持自然流，不强加 sticky 裁剪。
 */
export function OverflowFreezeTableCard({
  children,
  className,
  freezeFirstCol = false,
}: {
  children: ReactNode;
  className?: string;
  freezeFirstCol?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowX, setOverflowX] = useState(false);

  useEffect(() => {
    if (!freezeFirstCol) return;
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const next = el.scrollWidth > el.clientWidth + 1;
      setOverflowX((prev) => (prev === next ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [freezeFirstCol]);

  return (
    <Card
      ref={ref}
      data-overflow-x={freezeFirstCol && overflowX ? "true" : undefined}
      className={cn(
        "scroll-shadow-horizontal gap-0 overflow-x-auto p-0",
        freezeFirstCol &&
          "[&[data-overflow-x=true]_th:first-child]:sticky [&[data-overflow-x=true]_th:first-child]:left-0 [&[data-overflow-x=true]_th:first-child]:z-10 [&[data-overflow-x=true]_th:first-child]:bg-[#FCFCFB] [&[data-overflow-x=true]_th:first-child]:shadow-[1px_0_0_0_#E2E2DF] [&[data-overflow-x=true]_td:first-child]:sticky [&[data-overflow-x=true]_td:first-child]:left-0 [&[data-overflow-x=true]_td:first-child]:z-10 [&[data-overflow-x=true]_td:first-child]:bg-white [&[data-overflow-x=true]_td:first-child]:shadow-[1px_0_0_0_#E2E2DF]",
        className,
      )}
    >
      {children}
    </Card>
  );
}
