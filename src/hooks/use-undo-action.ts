"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseUndoActionOptions<T> {
  onExecute: (item: T) => Promise<void>;
  onUndo: (item: T) => Promise<void>;
  undoDuration?: number;
}

interface UseUndoActionResult<T> {
  execute: (item: T) => void;
  undoItem: T | null;
  undoCountdown: number;
  performUndo: () => void;
}

export function useUndoAction<T>({
  onExecute,
  onUndo,
  undoDuration = 5000,
}: UseUndoActionOptions<T>): UseUndoActionResult<T> {
  const [undoItem, setUndoItem] = useState<T | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingItemRef = useRef<T | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const execute = useCallback(
    (item: T) => {
      clearTimers();
      pendingItemRef.current = item;
      setUndoItem(item);
      setUndoCountdown(Math.ceil(undoDuration / 1000));

      intervalRef.current = setInterval(() => {
        setUndoCountdown((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      timerRef.current = setTimeout(() => {
        setUndoItem(null);
        setUndoCountdown(0);
        void onExecute(item);
        pendingItemRef.current = null;
      }, undoDuration);
    },
    [onExecute, undoDuration, clearTimers],
  );

  const performUndo = useCallback(() => {
    clearTimers();
    const item = pendingItemRef.current;
    setUndoItem(null);
    setUndoCountdown(0);
    pendingItemRef.current = null;
    if (item) {
      void onUndo(item);
    }
  }, [onUndo, clearTimers]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return { execute, undoItem, undoCountdown, performUndo };
}
