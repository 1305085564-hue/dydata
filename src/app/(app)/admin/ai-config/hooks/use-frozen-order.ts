"use client";

import { useState } from "react";
import { applyFrozenOrder } from "@/lib/ai-config/list-order";

/**
 * 进入时按 compare 排一次，之后保持位置不变；resetKey 变化（切视角、换渠道）时重排。
 * 数据还没到（空列表）时不定格，等第一次拿到数据再排。
 */
export function useFrozenOrder<T>(items: readonly T[], id: (item: T) => string, compare: (a: T, b: T) => number, resetKey: string = ""): T[] {
  const [snapshot, setSnapshot] = useState<{ resetKey: string; ids: string[] } | null>(null);
  const stale = items.length > 0 && (!snapshot || snapshot.resetKey !== resetKey);
  const ids = stale ? [...items].sort(compare).map(id) : snapshot?.resetKey === resetKey ? snapshot.ids : [];
  if (stale) setSnapshot({ resetKey, ids });
  return applyFrozenOrder(items, ids, id, compare);
}
