"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DraftEntry<T> {
  data: T;
  savedAt: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!bKeys.includes(key)) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!deepEqual((a as any)[key], (b as any)[key])) return false;
  }
  return true;
}

function isDraftEmpty<T>(data: T): boolean {
  if (data === null || data === undefined) return true;
  if (typeof data !== "object") return false;

  const values = Object.values(data);
  if (values.length === 0) return true;

  return values.every((v) => {
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    if (typeof v === "object" && Object.keys(v).length === 0) return true;
    return false;
  });
}

export interface UseFormDraftReturn<T> {
  hasDraft: boolean;
  restoreDraft: () => T | null;
  clearDraft: () => void;
  lastSavedAt: Date | null;
}

export function useFormDraft<T>(
  key: string,
  formData: T,
  deps: unknown[]
): UseFormDraftReturn<T> {
  const [hasDraft, setHasDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastSavedRef = useRef<T | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check for existing draft on mount + 跨 Tab 同步
  useEffect(() => {
    function refreshFromStorage() {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const entry = JSON.parse(raw) as DraftEntry<T>;
          if (entry?.data && entry.savedAt && !isDraftEmpty(entry.data)) {
            setHasDraft(true);
            setLastSavedAt(new Date(entry.savedAt));
            return;
          }
        }
        // 旧脏数据 / 空草稿 / 不存在 → 一律视为无草稿，并清掉脏 key
        localStorage.removeItem(key);
        setHasDraft(false);
        setLastSavedAt(null);
      } catch {
        // JSON 解析失败 → 清掉坏 key，避免长期卡住
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
        setHasDraft(false);
        setLastSavedAt(null);
      }
    }

    refreshFromStorage();

    // 多 Tab 同步：另一个 Tab 丢弃/恢复后，本 Tab 实时更新
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return;
      refreshFromStorage();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      if (isDraftEmpty(formData)) return;
      if (lastSavedRef.current && deepEqual(lastSavedRef.current, formData)) {
        return;
      }

      try {
        const entry: DraftEntry<T> = {
          data: formData,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(key, JSON.stringify(entry));
        lastSavedRef.current = formData;
        setLastSavedAt(new Date());
        setHasDraft(true);
      } catch {
        // localStorage may be full or unavailable
      }
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  const restoreDraft = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as DraftEntry<T>;
      if (!entry.data) return null;
      return entry.data;
    } catch {
      return null;
    }
  }, [key]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    lastSavedRef.current = null;
    setHasDraft(false);
    setLastSavedAt(null);
  }, [key]);

  return {
    hasDraft,
    restoreDraft,
    clearDraft,
    lastSavedAt,
  };
}
