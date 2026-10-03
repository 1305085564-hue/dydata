"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionCenterSummary } from "@/lib/action-center/types";
import {
  getCachedActionCenterSummary,
  requestActionCenterSummary,
} from "@/lib/navigation/data/action-center-summary";

export function useActionCenterSummary(userId: string) {
  const [summary, setSummary] = useState<ActionCenterSummary | null>(() =>
    getCachedActionCenterSummary(userId),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applySequenceRef = useRef(0);

  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const cached = getCachedActionCenterSummary(userId);
      if (!force && cached) setSummary(cached);
      setLoading(true);
      setError(null);
      const applySequence = ++applySequenceRef.current;
      try {
        const nextSummary = await requestActionCenterSummary(userId, force);
        if (applySequence === applySequenceRef.current) setSummary(nextSummary);
        return nextSummary;
      } catch {
        if (applySequence === applySequenceRef.current) setError("暂时没同步到最新");
        return null;
      } finally {
        if (applySequence === applySequenceRef.current) setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void sync();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [sync]);

  return { summary, loading, error, sync };
}
