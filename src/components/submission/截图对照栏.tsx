"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";
import type { SubmissionSlotRole } from "./提交状态机";

/** 宽屏才放对照栏。外框保持 1024、表单 768 靠左（占四分之三）；对照栏 360 + 间距 24 伸进外框右侧的页边留白，需要 (视口 - 1024) / 2 + 768 + 384 + 24 <= 视口，即视口 >= 1328。窄于此不放栏，核对时点截图卡片的小图开检视器 */
export const COMPARE_RAIL_MEDIA_QUERY = "(min-width: 1330px)";

function subscribeRailQuery(onChange: () => void) {
  const media = window.matchMedia(COMPARE_RAIL_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useCompareRailEnabled(): boolean {
  return useSyncExternalStore(
    subscribeRailQuery,
    () => window.matchMedia(COMPARE_RAIL_MEDIA_QUERY).matches,
    () => false,
  );
}

const ROLE_META: Array<{ role: SubmissionSlotRole; label: string }> = [
  { role: "screenshot_1", label: "互动" },
  { role: "screenshot_2", label: "留存" },
];

/** 显示哪张：优先最近聚焦 / 点选的那张；那张没图就退到另一张有图的；都没图返回 null */
export function resolveCompareRole(
  images: Record<SubmissionSlotRole, string | null | undefined>,
  preferred: SubmissionSlotRole | null,
): SubmissionSlotRole | null {
  if (preferred && images[preferred]) return preferred;
  return ROLE_META.find(({ role }) => Boolean(images[role]))?.role ?? null;
}

const ZOOM = 2;
const DRAG_THRESHOLD_PX = 4;

/**
 * 截图对照栏：宽屏时常驻在表单右侧，吸顶，按聚焦的数字格切换互动 / 留存截图。
 * 点图在栏内「看全图 ↔ 放大 2 倍」，放大后可拖动；不另开浮层，不挡表单。
 */
export function ScreenshotCompareRail({
  images,
  preferredRole,
  onSelectRole,
}: {
  images: Record<SubmissionSlotRole, string | null | undefined>;
  preferredRole: SubmissionSlotRole | null;
  onSelectRole: (role: SubmissionSlotRole) => void;
}) {
  const role = resolveCompareRole(images, preferredRole);
  const url = role ? images[role] : null;
  const [zoomState, setZoomState] = useState<{ url: string | null; zoomed: boolean }>({ url: null, zoomed: false });
  // 换图就回到全图
  const zoomed = zoomState.zoomed && zoomState.url === url;
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  // 放大后把点的那一处对到视窗中央
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const anchor = zoomAnchorRef.current;
    if (!viewport) return;
    if (!zoomed) {
      viewport.scrollLeft = 0;
      return;
    }
    if (!anchor) return;
    viewport.scrollLeft = anchor.x * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollTop = anchor.y * viewport.scrollHeight - viewport.clientHeight / 2;
    zoomAnchorRef.current = null;
  }, [zoomed]);

  if (!role || !url) return null;
  const available = ROLE_META.filter((item) => Boolean(images[item.role]));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || !zoomed) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) viewport.setPointerCapture(e.pointerId);
    drag.moved = true;
    viewport.scrollLeft = drag.left - dx;
    viewport.scrollTop = drag.top - dy;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!viewport || !drag) return;
    if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    if (drag.moved) return;
    if (!zoomed) {
      const rect = viewport.getBoundingClientRect();
      zoomAnchorRef.current = {
        x: (e.clientX - rect.left + viewport.scrollLeft) / viewport.scrollWidth,
        y: (e.clientY - rect.top + viewport.scrollTop) / viewport.scrollHeight,
      };
    }
    setZoomState({ url, zoomed: !zoomed });
  };

  return (
    <aside
      aria-label="截图对照"
      data-testid="screenshot-compare-rail"
      className="sticky top-[calc(var(--app-top-offset,64px)+1rem)] flex max-h-[calc(100dvh-var(--app-top-offset,64px)-2rem)] flex-col overflow-hidden rounded-xl border border-[#E2E2DF] bg-white"
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[#E2E2DF] px-3">
        <span className="text-[12px] text-[#78716C]">截图对照</span>
        <div role="tablist" aria-label="切换对照截图" className="flex items-center gap-1">
          {available.map((item) => (
            <button
              key={item.role}
              type="button"
              role="tab"
              aria-selected={item.role === role}
              onClick={() => onSelectRole(item.role)}
              className={cn(
                "h-7 rounded-md px-2 text-[12px] transition-colors cursor-pointer",
                item.role === role ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#F1F1F0] hover:text-[#141413]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={viewportRef}
        role="button"
        tabIndex={0}
        aria-label={zoomed ? "缩回全图" : "放大截图"}
        title={zoomed ? "拖动查看，点一下缩回全图" : "点一下放大"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setZoomState({ url, zoomed: !zoomed });
          }
        }}
        className={cn(
          "min-h-0 flex-1 overflow-auto overscroll-contain bg-[#F1F1F0] outline-none select-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#141413]/20",
          zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        )}
      >
        <ScreenshotImage
          src={url}
          alt={`${ROLE_META.find((item) => item.role === role)?.label ?? ""}截图对照`}
          variant="stage"
          draggable={false}
          style={{ width: zoomed ? `${ZOOM * 100}%` : "100%" }}
          className="block h-auto max-w-none"
          placeholderClassName="min-h-[200px] w-full"
        />
      </div>

      <div className="flex h-8 shrink-0 items-center border-t border-[#E2E2DF] px-3 text-[12px] text-[#78716C]">
        {zoomed ? "拖动查看，点一下缩回全图" : "点图放大"}
      </div>
    </aside>
  );
}

export { ScreenshotCompareRail as 截图对照栏 };
