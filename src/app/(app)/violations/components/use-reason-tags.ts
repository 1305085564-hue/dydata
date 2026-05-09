"use client";

import { useEffect, useState } from "react";

export type ReasonTag = {
  id: string;
  name: string;
  sort_order: number;
};

type ReasonTagsState = {
  tags: ReasonTag[];
  isLoading: boolean;
  error: string | null;
};

type ReasonTagsApiResponse = {
  data?: unknown;
  error?: string;
};

function parseTags(payload: unknown): ReasonTag[] {
  if (!payload || typeof payload !== "object") return [];
  const list = (payload as ReasonTagsApiResponse).data;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; name?: unknown; sort_order?: unknown };
    if (typeof row.id !== "string" || typeof row.name !== "string") return [];
    const sortOrder = typeof row.sort_order === "number" ? row.sort_order : 0;
    return [{ id: row.id, name: row.name, sort_order: sortOrder }];
  });
}

export function useReasonTags() {
  const [state, setState] = useState<ReasonTagsState>({ tags: [], isLoading: true, error: null });

  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/conversion-hub/reason-tags", {
          method: "GET",
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => ({}));
        if (aborted) return;
        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in (payload as object)
              ? String((payload as { error?: unknown }).error ?? "获取原因标签失败")
              : "获取原因标签失败";
          setState({ tags: [], isLoading: false, error: message });
          return;
        }
        setState({ tags: parseTags(payload), isLoading: false, error: null });
      } catch (error) {
        if (aborted) return;
        if ((error as { name?: string } | null)?.name === "AbortError") return;
        setState({
          tags: [],
          isLoading: false,
          error: error instanceof Error ? error.message : "获取原因标签失败",
        });
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, []);

  return state;
}
