"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { YikeItem } from "./types";

/** 一个落区：拖拽松手命中它就触发 onDrop。 */
export interface YikeDropZone {
  id: string;
  getRect: () => DOMRect | null;
  accepts: (item: YikeItem) => boolean;
  onDrop: (item: YikeItem) => void;
}

interface YikeDragContextValue {
  dragItem: YikeItem | null;
  hoverZoneId: string | null;
  pointer: { x: number; y: number };
  registerZone: (zone: YikeDropZone) => () => void;
  beginDrag: (item: YikeItem) => void;
  endDrag: (point: { x: number; y: number }) => void;
}

const YikeDragContext = React.createContext<YikeDragContextValue | null>(null);

export function useYikeDrag() {
  return React.useContext(YikeDragContext);
}

export function YikeDragProvider({ children }: { children: React.ReactNode }) {
  const zonesRef = React.useRef<Map<string, YikeDropZone>>(new Map());
  const [dragItem, setDragItem] = React.useState<YikeItem | null>(null);
  const [hoverZoneId, setHoverZoneId] = React.useState<string | null>(null);
  const [pointer, setPointer] = React.useState({ x: 0, y: 0 });

  const registerZone = React.useCallback((zone: YikeDropZone) => {
    zonesRef.current.set(zone.id, zone);
    return () => {
      zonesRef.current.delete(zone.id);
    };
  }, []);

  const zoneAtPoint = React.useCallback((item: YikeItem, x: number, y: number): YikeDropZone | null => {
    for (const zone of zonesRef.current.values()) {
      if (!zone.accepts(item)) continue;
      const r = zone.getRect();
      if (!r) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return zone;
    }
    return null;
  }, []);

  const beginDrag = React.useCallback((item: YikeItem) => setDragItem(item), []);

  const endDrag = React.useCallback(
    (point: { x: number; y: number }) => {
      const item = dragItem;
      setDragItem(null);
      setHoverZoneId(null);
      if (!item) return;
      const zone = zoneAtPoint(item, point.x, point.y);
      if (zone) zone.onDrop(item);
    },
    [dragItem, zoneAtPoint],
  );

  React.useEffect(() => {
    if (!dragItem) return;
    const onMove = (e: PointerEvent) => {
      setPointer({ x: e.clientX, y: e.clientY });
      const zone = zoneAtPoint(dragItem, e.clientX, e.clientY);
      setHoverZoneId(zone?.id ?? null);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [dragItem, zoneAtPoint]);

  const value = React.useMemo(
    () => ({ dragItem, hoverZoneId, pointer, registerZone, beginDrag, endDrag }),
    [dragItem, hoverZoneId, pointer, registerZone, beginDrag, endDrag],
  );

  return (
    <YikeDragContext.Provider value={value}>
      {children}
      <DragPill item={dragItem} pointer={pointer} />
    </YikeDragContext.Provider>
  );
}

/** 拖拽时跟随指针的小药丸：只剩标题，让出面板字段空间。 */
function DragPill({ item, pointer }: { item: YikeItem | null; pointer: { x: number; y: number } }) {
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.12 }}
          style={{ left: pointer.x + 14, top: pointer.y + 14 }}
          className="pointer-events-none fixed z-[100] max-w-[200px] truncate rounded-full border border-[#D97757]/40 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.25)]"
        >
          {item.title}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 给落区组件用的 hook：注册自己的 DOM + 返回是否正被悬停。enabled=false 时不注册。 */
export function useDropZone(
  ref: React.RefObject<HTMLElement | null>,
  opts: { id: string; enabled?: boolean; accepts: (item: YikeItem) => boolean; onDrop: (item: YikeItem) => void },
) {
  const ctx = useYikeDrag();
  const { id, enabled = true, accepts, onDrop } = opts;
  const acceptsRef = React.useRef(accepts);
  const onDropRef = React.useRef(onDrop);
  acceptsRef.current = accepts;
  onDropRef.current = onDrop;

  React.useEffect(() => {
    if (!ctx || !enabled) return;
    return ctx.registerZone({
      id,
      getRect: () => ref.current?.getBoundingClientRect() ?? null,
      accepts: (item) => acceptsRef.current(item),
      onDrop: (item) => onDropRef.current(item),
    });
  }, [ctx, id, enabled, ref]);

  const isHovered = enabled && ctx?.hoverZoneId === id;
  const isArmed = enabled && ctx?.dragItem != null && acceptsRef.current(ctx.dragItem);
  return { isHovered, isArmed };
}
