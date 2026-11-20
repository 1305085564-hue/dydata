"use client";

import { useId, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 本页悬停提示：同一时刻全页只开一个。
 * 旧做法每个提示各管各的开合，鼠标扫过一排格子时会叠出三四层浮层不消失；
 * 这里用一个页内共享的「当前打开者」，新的一打开，上一个立即关掉。
 * 浮层本身不可悬停停留（disableHoverablePopup），避免盖住相邻格子。
 * 关闭即卸载（不播退场动画）由 TooltipContent 统一保证。
 */
let openId: string | null = null;
const listeners = new Set<() => void>();

function setOpenId(next: string | null) {
  if (openId === next) return;
  openId = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => openId;
const getServerSnapshot = () => null;

export function OneTip({
  tip,
  align = "end",
  side = "top",
  wide = false,
  children,
}: {
  tip: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  /** 明细型提示（逐项列表）用固定宽度，短句提示自适应。 */
  wide?: boolean;
  children: ReactElement;
}) {
  const id = useId();
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const open = current === id;

  return (
    <Tooltip
      open={open}
      disableHoverablePopup
      onOpenChange={(next) => {
        if (next) setOpenId(id);
        else if (openId === id) setOpenId(null);
      }}
    >
      <TooltipTrigger delay={100} closeDelay={0} render={children} />
      <TooltipContent
        side={side}
        align={align}
        className={`pointer-events-none ${
          wide
            ? "w-[264px] max-w-[264px] flex-col items-stretch gap-2 p-3 text-left"
            : "max-w-xs text-left leading-relaxed"
        }`}
      >
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
