import { useCallback, useSyncExternalStore } from "react";

export type CollaborationDetailMode = "full" | "concise";
export type ContentMetricViewMode = "full" | "spacious";

export const COLLABORATION_DETAIL_MODE_KEY = "dydata:collaboration:detail-mode";
export const CONTENT_METRIC_VIEW_MODE_KEY = "dydata:content:metric-view-mode";

const COLLABORATION_MODES = ["full", "concise"] as const;
const CONTENT_MODES = ["full", "spacious"] as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const listenersByKey: Record<string, Set<() => void> | undefined> = Object.create(null);
const memoryFallbackByKey: Record<string, string | undefined> = Object.create(null);
let storageListenerAttached = false;

function notifyKey(key: string) {
  const listeners = listenersByKey[key];
  if (!listeners) return;
  for (const listener of listeners) {
    listener();
  }
}

function ensureStorageListener() {
  if (storageListenerAttached || typeof window === "undefined") return;
  storageListenerAttached = true;
  window.addEventListener("storage", (event) => {
    if (event.key === null) {
      for (const key of Object.keys(listenersByKey)) notifyKey(key);
      return;
    }
    notifyKey(event.key);
  });
}

function resolveStorage(explicit?: StorageLike | null): StorageLike | null {
  if (explicit !== undefined) return explicit;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPersistedMode<T extends string>(
  storageKey: string,
  allowed: readonly T[],
  fallback: T,
  explicitStorage?: StorageLike | null,
): T {
  const storage = resolveStorage(explicitStorage);
  if (storage) {
    try {
      const raw = storage.getItem(storageKey);
      if (raw !== null && (allowed as readonly string[]).includes(raw)) {
        return raw as T;
      }
      // 读取成功但无有效记录（含未设置或被外部清空）时回落默认值，不被旧内存兜底覆盖
      return fallback;
    } catch {
      // localStorage 被禁用或抛异常时退回同会话内存兜底
    }
  }
  const mem = memoryFallbackByKey[storageKey];
  if (mem !== undefined && (allowed as readonly string[]).includes(mem)) {
    return mem as T;
  }
  return fallback;
}

export function writePersistedMode<T extends string>(
  storageKey: string,
  value: T,
  explicitStorage?: StorageLike | null,
): void {
  memoryFallbackByKey[storageKey] = value;
  const storage = resolveStorage(explicitStorage);
  if (storage) {
    try {
      storage.setItem(storageKey, value);
    } catch {
      // 隐私模式或配额满时保留内存兜底，不中断页面交互
    }
  }
  notifyKey(storageKey);
}

export function usePersistedMode<T extends string>(
  storageKey: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      ensureStorageListener();
      let set = listenersByKey[storageKey];
      if (!set) {
        set = new Set();
        listenersByKey[storageKey] = set;
      }
      set.add(onStoreChange);
      return () => {
        set.delete(onStoreChange);
        if (set.size === 0) delete listenersByKey[storageKey];
      };
    },
    [storageKey],
  );

  const getSnapshot = useCallback(
    () => readPersistedMode(storageKey, allowed, fallback),
    [storageKey, allowed, fallback],
  );

  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = readPersistedMode(storageKey, allowed, fallback);
      const resolved = typeof next === "function" ? next(current) : next;
      writePersistedMode(storageKey, resolved);
    },
    [storageKey, allowed, fallback],
  );

  return [value, setValue];
}

export function useCollaborationDetailMode() {
  const [mode, setMode] = usePersistedMode<CollaborationDetailMode>(
    COLLABORATION_DETAIL_MODE_KEY,
    COLLABORATION_MODES,
    "full",
  );
  return {
    mode,
    showDetail: mode === "full",
    setMode,
  };
}

export function useContentMetricViewMode() {
  return usePersistedMode<ContentMetricViewMode>(
    CONTENT_METRIC_VIEW_MODE_KEY,
    CONTENT_MODES,
    "full",
  );
}
