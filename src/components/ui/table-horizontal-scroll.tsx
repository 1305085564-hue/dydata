"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const OVERFLOW_EPSILON = 1;
const EDGE_EPSILON = 0.5;
const VIEWPORT_MARGIN_PX = 80;
const NATIVE_BAR_VISIBLE_BUFFER_PX = 4;
const VIEWPORT_TOP_SAFE_PX = 64;
const VIEWPORT_BOTTOM_SAFE_PX = 32;
const MIN_BUTTON_TOP_PX = 44;
const BUTTON_HALF_HEIGHT_PX = 16;
const MIN_STEP_PX = 240;
const STEP_RATIO = 0.7;
const MIN_THUMB_PX = 44;
const ARROW_GUTTER_PX = 8;
const SCROLL_THROTTLE_MS = 16;

interface HScrollMetrics {
  hasOverflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollLeft: number;
  maxScrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  stickyColWidth: number;
  buttonTop: number;
  showFloatingBar: boolean;
  barLeft: number;
  barWidth: number;
}

const INITIAL_METRICS: HScrollMetrics = {
  hasOverflow: false,
  canScrollLeft: false,
  canScrollRight: false,
  scrollLeft: 0,
  maxScrollLeft: 0,
  clientWidth: 0,
  scrollWidth: 0,
  stickyColWidth: 0,
  buttonTop: MIN_BUTTON_TOP_PX,
  showFloatingBar: false,
  barLeft: 0,
  barWidth: 0,
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function measureStickyFirstColWidth(scrollEl: HTMLElement): number {
  const thead = scrollEl.querySelector("thead");
  const firstTh = thead?.querySelector("th") ?? scrollEl.querySelector("th");
  if (!firstTh) return 0;

  const computedPos =
    typeof window !== "undefined" && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(firstTh)?.position
      : "";
  let isSticky: boolean;
  if (computedPos) {
    isSticky = computedPos === "sticky";
  } else {
    const inlinePos = (firstTh as HTMLElement).style?.position;
    const className = typeof firstTh.className === "string" ? firstTh.className : "";
    const tableEl = scrollEl.querySelector("table");
    const freezeAttr = tableEl?.getAttribute("data-freeze-first");
    isSticky =
      inlinePos === "sticky"
      || /(?:^|\s)sticky(?:\s|$)/.test(className)
      || freezeAttr === "true";
  }
  if (!isSticky) return 0;

  const rectWidth = firstTh.getBoundingClientRect().width;
  const measured = rectWidth > 0 ? rectWidth : firstTh.clientWidth;
  if (measured <= 0) return 0;

  const maxAllowed = scrollEl.clientWidth > 0 ? Math.floor(scrollEl.clientWidth * 0.6) : measured;
  return Math.min(Math.round(measured), maxAllowed);
}

function measureHeaderHeight(scrollEl: HTMLElement): number {
  const thead = scrollEl.querySelector("thead");
  if (!thead) return 0;
  const height = thead.getBoundingClientRect().height;
  return height > 0 ? Math.round(height) : 0;
}

function computeButtonTop(rect: DOMRect, headerHeight: number, viewportHeight: number): number {
  const containerHeight = rect.height;
  const minTop = Math.max(MIN_BUTTON_TOP_PX, headerHeight > 0 ? headerHeight + BUTTON_HALF_HEIGHT_PX : 0);
  if (containerHeight <= 0) return minTop;

  const maxTop = Math.max(minTop, containerHeight - MIN_BUTTON_TOP_PX);
  const visibleTop = Math.max(rect.top, VIEWPORT_TOP_SAFE_PX);
  const visibleBottom = Math.min(rect.bottom, viewportHeight - VIEWPORT_BOTTOM_SAFE_PX);
  const rawTop = visibleBottom > visibleTop
    ? (visibleTop + visibleBottom) / 2 - rect.top
    : containerHeight / 2;

  return Math.round(clamp(rawTop, minTop, maxTop));
}

function measureHScrollMetrics(shellEl: HTMLElement, scrollEl: HTMLElement): HScrollMetrics {
  const clientWidth = scrollEl.clientWidth;
  const scrollWidth = scrollEl.scrollWidth;
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const hasOverflow = maxScrollLeft > OVERFLOW_EPSILON;

  if (!hasOverflow) {
    return INITIAL_METRICS;
  }

  const scrollLeft = clamp(scrollEl.scrollLeft, 0, maxScrollLeft);
  const canScrollLeft = scrollLeft > EDGE_EPSILON;
  const canScrollRight = scrollLeft < maxScrollLeft - EDGE_EPSILON;
  const rect = shellEl.getBoundingClientRect();
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const stickyColWidth = measureStickyFirstColWidth(scrollEl);
  const headerHeight = measureHeaderHeight(scrollEl);
  const buttonTop = computeButtonTop(rect, headerHeight, viewportHeight);

  const hasVisibleBox = rect.width > 0 && rect.height > 0;
  const inViewport = rect.top < viewportHeight - VIEWPORT_MARGIN_PX && rect.bottom > VIEWPORT_MARGIN_PX;
  const nativeBarHiddenBelow = rect.bottom > viewportHeight + NATIVE_BAR_VISIBLE_BUFFER_PX;
  const showFloatingBar = hasVisibleBox && inViewport && nativeBarHiddenBelow;

  return {
    hasOverflow,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    maxScrollLeft,
    clientWidth,
    scrollWidth,
    stickyColWidth,
    buttonTop,
    showFloatingBar,
    barLeft: Math.round(rect.left),
    barWidth: Math.round(rect.width),
  };
}

function metricsEqual(a: HScrollMetrics, b: HScrollMetrics): boolean {
  return (
    a.hasOverflow === b.hasOverflow
    && a.canScrollLeft === b.canScrollLeft
    && a.canScrollRight === b.canScrollRight
    && Math.abs(a.scrollLeft - b.scrollLeft) < 0.5
    && Math.abs(a.maxScrollLeft - b.maxScrollLeft) < 0.5
    && a.clientWidth === b.clientWidth
    && a.scrollWidth === b.scrollWidth
    && a.stickyColWidth === b.stickyColWidth
    && a.buttonTop === b.buttonTop
    && a.showFloatingBar === b.showFloatingBar
    && a.barLeft === b.barLeft
    && a.barWidth === b.barWidth
  );
}

function scrollContainerTo(scrollEl: HTMLElement, left: number, behavior: ScrollBehavior) {
  if (typeof scrollEl.scrollTo === "function") {
    scrollEl.scrollTo({ left, behavior });
  } else {
    scrollEl.scrollLeft = left;
  }
}

interface FloatingHorizontalScrollbarProps {
  controlsId: string;
  metrics: HScrollMetrics;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSync: () => void;
}

function FloatingHorizontalScrollbar({
  controlsId,
  metrics,
  scrollRef,
  onSync,
}: FloatingHorizontalScrollbarProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const dragCleanupRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  const thumbWidthPercent = React.useMemo(() => {
    if (metrics.scrollWidth <= 0 || metrics.clientWidth <= 0) return 20;
    const rawPercent = (metrics.clientWidth / metrics.scrollWidth) * 100;
    const trackEstimate = Math.max(1, metrics.barWidth - 24);
    const minPercent = Math.min(40, (MIN_THUMB_PX / trackEstimate) * 100);
    return clamp(rawPercent, minPercent, 100);
  }, [metrics.barWidth, metrics.clientWidth, metrics.scrollWidth]);

  const scrollRatio = metrics.maxScrollLeft > 0
    ? clamp(metrics.scrollLeft / metrics.maxScrollLeft, 0, 1)
    : 0;
  const thumbLeftPercent = scrollRatio * (100 - thumbWidthPercent);

  const handleTrackMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const scrollEl = scrollRef.current;
    const trackEl = trackRef.current;
    if (!scrollEl || !trackEl || metrics.maxScrollLeft <= 0) return;

    event.preventDefault();
    const trackRect = trackEl.getBoundingClientRect();
    const trackWidth = trackRect.width > 0 ? trackRect.width : Math.max(1, metrics.barWidth - 24);
    const thumbPx = (thumbWidthPercent / 100) * trackWidth;
    const usableTrack = Math.max(1, trackWidth - thumbPx);
    const clickX = event.clientX - trackRect.left;
    const targetThumbLeft = clamp(clickX - thumbPx / 2, 0, usableTrack);
    const nextScrollLeft = (targetThumbLeft / usableTrack) * metrics.maxScrollLeft;

    scrollContainerTo(scrollEl, nextScrollLeft, "smooth");
    onSync();
  };

  const handleThumbMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const scrollEl = scrollRef.current;
    const trackEl = trackRef.current;
    if (!scrollEl || !trackEl || metrics.maxScrollLeft <= 0) return;

    event.preventDefault();
    event.stopPropagation();

    dragCleanupRef.current?.();
    setDragging(true);

    const trackRect = trackEl.getBoundingClientRect();
    const trackWidth = trackRect.width > 0 ? trackRect.width : Math.max(1, metrics.barWidth - 24);
    const thumbPx = (thumbWidthPercent / 100) * trackWidth;
    const usableTrack = Math.max(1, trackWidth - thumbPx);
    const startX = event.clientX;
    const startScrollLeft = scrollEl.scrollLeft;
    const maxScrollLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const nextScrollLeft = clamp(
        startScrollLeft + (deltaX / usableTrack) * maxScrollLeft,
        0,
        maxScrollLeft,
      );
      scrollEl.scrollLeft = nextScrollLeft;
      onSync();
    };

    const cleanup = () => {
      setDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", cleanup);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", cleanup);
  };

  if (typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <div
      data-slot="table-floating-hscroll"
      className="pointer-events-none fixed bottom-3 z-[var(--z-floating-action,30)] px-3"
      style={{ left: `${metrics.barLeft}px`, width: `${metrics.barWidth}px` }}
    >
      <div
        ref={trackRef}
        data-slot="table-floating-hscroll-track"
        role="scrollbar"
        aria-controls={controlsId}
        aria-orientation="horizontal"
        aria-label="表格横向滚动条"
        aria-valuemin={0}
        aria-valuemax={Math.round(metrics.maxScrollLeft)}
        aria-valuenow={Math.round(metrics.scrollLeft)}
        onMouseDown={handleTrackMouseDown}
        className="pointer-events-auto relative flex h-5 w-full cursor-pointer select-none items-center"
      >
        <div className="relative h-1.5 w-full rounded-full bg-[#E2E2DF]/70 backdrop-blur-sm">
          <div
            data-slot="table-floating-hscroll-thumb"
            data-dragging={dragging ? "true" : undefined}
            onMouseDown={handleThumbMouseDown}
            className={cn(
              "absolute inset-y-0 rounded-full transition-colors duration-150 ease-smooth",
              dragging ? "bg-[#78716C]" : "bg-[#A8A29E] hover:bg-[#78716C]",
            )}
            style={{
              width: `${thumbWidthPercent}%`,
              left: `${thumbLeftPercent}%`,
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface TableHorizontalScrollProps {
  children: React.ReactNode;
}

export function TableHorizontalScroll({ children }: TableHorizontalScrollProps) {
  const scrollContainerId = React.useId();
  const shellRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = React.useState<HScrollMetrics>(INITIAL_METRICS);

  const syncMetrics = React.useCallback(() => {
    const shellEl = shellRef.current;
    const scrollEl = scrollRef.current;
    if (!shellEl || !scrollEl) return;
    const next = measureHScrollMetrics(shellEl, scrollEl);
    setMetrics((prev) => (metricsEqual(prev, next) ? prev : next));
  }, []);

  React.useEffect(() => {
    const shellEl = shellRef.current;
    const scrollEl = scrollRef.current;
    if (!shellEl || !scrollEl) return;

    let lastScrollSync = 0;
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleScrollSync = () => {
      const now = Date.now();
      const elapsed = now - lastScrollSync;
      if (elapsed >= SCROLL_THROTTLE_MS) {
        lastScrollSync = now;
        if (trailingTimer !== null) {
          clearTimeout(trailingTimer);
          trailingTimer = null;
        }
        syncMetrics();
      } else if (trailingTimer === null) {
        trailingTimer = setTimeout(() => {
          trailingTimer = null;
          lastScrollSync = Date.now();
          syncMetrics();
        }, SCROLL_THROTTLE_MS - elapsed);
      }
    };

    const handleScroll = () => syncMetrics();

    const handleWindowScroll = (event: Event) => {
      if (event.target === scrollEl) return;
      scheduleScrollSync();
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.shiftKey) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const maxScrollLeft = scrollEl.scrollWidth - scrollEl.clientWidth;
      if (maxScrollLeft <= OVERFLOW_EPSILON) return;

      const delta = event.deltaY;
      const canMoveRight = delta > 0 && scrollEl.scrollLeft < maxScrollLeft - EDGE_EPSILON;
      const canMoveLeft = delta < 0 && scrollEl.scrollLeft > EDGE_EPSILON;
      if (!canMoveRight && !canMoveLeft) return;

      event.preventDefault();
      scrollEl.scrollLeft = clamp(scrollEl.scrollLeft + delta, 0, maxScrollLeft);
      syncMetrics();
    };

    syncMetrics();

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    scrollEl.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("resize", syncMetrics, { passive: true });
    window.addEventListener("scroll", handleWindowScroll, { passive: true, capture: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(syncMetrics);
      observer.observe(scrollEl);
      if (scrollEl.firstElementChild) {
        observer.observe(scrollEl.firstElementChild);
      }
    }

    return () => {
      if (trailingTimer !== null) {
        clearTimeout(trailingTimer);
      }
      scrollEl.removeEventListener("scroll", handleScroll);
      scrollEl.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", syncMetrics);
      window.removeEventListener("scroll", handleWindowScroll, true);
      observer?.disconnect();
    };
  }, [syncMetrics]);

  const handleStepScroll = (direction: "left" | "right", event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const maxScrollLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
    const step = Math.max(MIN_STEP_PX, Math.round((scrollEl.clientWidth - metrics.stickyColWidth) * STEP_RATIO));
    const target = direction === "right"
      ? Math.min(maxScrollLeft, scrollEl.scrollLeft + step)
      : Math.max(0, scrollEl.scrollLeft - step);

    scrollContainerTo(scrollEl, target, "smooth");
    syncMetrics();
  };

  const leftButtonOffset = metrics.stickyColWidth > 0
    ? metrics.stickyColWidth + ARROW_GUTTER_PX
    : ARROW_GUTTER_PX;

  return (
    <div
      ref={shellRef}
      data-slot="table-scroll-shell"
      className="group/table-hscroll relative w-full min-w-0"
    >
      <div
        id={scrollContainerId}
        ref={scrollRef}
        data-slot="table-container"
        className="relative w-full overflow-x-auto"
      >
        {children}
      </div>

      {metrics.hasOverflow && (
        <>
          <div
            data-slot="table-hscroll-fade-right"
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 z-20 w-7 bg-gradient-to-l from-[#FFFFFF] via-[#FFFFFF]/80 to-transparent transition-opacity duration-150 ease-smooth",
              metrics.canScrollRight ? "opacity-100" : "opacity-0",
            )}
          />

          {metrics.canScrollLeft && (
            <button
              type="button"
              data-slot="table-hscroll-btn-left"
              aria-label="向左查看更多列"
              onClick={(event) => handleStepScroll("left", event)}
              style={{
                left: `${leftButtonOffset}px`,
                top: `${metrics.buttonTop}px`,
              }}
              className="absolute z-20 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[#E2E2DF] bg-[#FFFFFF]/95 text-[#78716C] shadow-claude-float opacity-0 transition-[opacity,background-color,color,transform] duration-150 ease-smooth hover:bg-[#FFFFFF] hover:text-[#141413] hover:opacity-100 group-hover/table-hscroll:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/20"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {metrics.canScrollRight && (
            <button
              type="button"
              data-slot="table-hscroll-btn-right"
              aria-label="向右查看更多列"
              onClick={(event) => handleStepScroll("right", event)}
              style={{
                right: `${ARROW_GUTTER_PX}px`,
                top: `${metrics.buttonTop}px`,
              }}
              className="absolute z-20 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[#E2E2DF] bg-[#FFFFFF]/95 text-[#78716C] shadow-claude-float opacity-0 transition-[opacity,background-color,color,transform] duration-150 ease-smooth hover:bg-[#FFFFFF] hover:text-[#141413] hover:opacity-100 group-hover/table-hscroll:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/20"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {metrics.showFloatingBar && (
            <FloatingHorizontalScrollbar
              controlsId={scrollContainerId}
              metrics={metrics}
              scrollRef={scrollRef}
              onSync={syncMetrics}
            />
          )}
        </>
      )}
    </div>
  );
}
