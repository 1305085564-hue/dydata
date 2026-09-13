"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { feedbackToast } from "@/components/ui/feedback-toast";

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

interface UseFormDraftOptions<T> {
  isEmpty?: (data: T) => boolean;
}

export function useFormDraft<T>(
  key: string,
  formData: T,
  deps: unknown[],
  options: UseFormDraftOptions<T> = {}
): UseFormDraftReturn<T> {
  const [hasDraft, setHasDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastSavedRef = useRef<T | null>(null);
  const formDataRef = useRef(formData);
  const hasWarnedSaveFailureRef = useRef(false);
  const isEmpty = options.isEmpty ?? isDraftEmpty;

  formDataRef.current = formData;

  // Check for existing draft on mount + 跨 Tab 同步
  useEffect(() => {
    function refreshFromStorage() {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const entry = JSON.parse(raw) as DraftEntry<T>;
          if (entry?.data && entry.savedAt && !isEmpty(entry.data)) {
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
  }, [key, isEmpty]);

  // 关闭页面前立刻保存最新草稿，避免防抖窗口内的数据丢失。
  useEffect(() => {
    function flush() {
      const latestFormData = formDataRef.current;
      if (isEmpty(latestFormData)) return;
      if (lastSavedRef.current && deepEqual(lastSavedRef.current, latestFormData)) {
        return;
      }

      try {
        const entry: DraftEntry<T> = {
          data: latestFormData,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(key, JSON.stringify(entry));
        lastSavedRef.current = latestFormData;
      } catch {
        // pagehide 阶段不弹 toast，避免阻塞关闭流程。
      }
    }

    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [key, isEmpty]);

  // 输入停止 1 秒后自动保存，替代原 30 秒轮询。
  useEffect(() => {
    if (isEmpty(formData)) return;
    if (lastSavedRef.current && deepEqual(lastSavedRef.current, formData)) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        const savedAt = new Date();
        const entry: DraftEntry<T> = {
          data: formData,
          savedAt: savedAt.toISOString(),
        };
        localStorage.setItem(key, JSON.stringify(entry));
        lastSavedRef.current = formData;
        setLastSavedAt(savedAt);
        setHasDraft(true);
      } catch {
        if (!hasWarnedSaveFailureRef.current) {
          hasWarnedSaveFailureRef.current = true;
          feedbackToast.warning("草稿保存失败：浏览器存储空间不足或已禁用");
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isEmpty, ...deps]);

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
