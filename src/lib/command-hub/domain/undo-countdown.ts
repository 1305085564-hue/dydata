export function computeRemainingSeconds(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

export function stepUndoEntries<T extends { id: string; remainingMs: number }>(
  entries: Iterable<T>,
  elapsedMs: number,
): { active: T[]; expired: T[] } {
  const safeElapsed = Math.max(0, elapsedMs);
  const active: T[] = [];
  const expired: T[] = [];
  for (const entry of entries) {
    const nextRemainingMs = entry.remainingMs - safeElapsed;
    if (nextRemainingMs <= 0) {
      expired.push({ ...entry, remainingMs: 0 });
    } else {
      active.push({ ...entry, remainingMs: nextRemainingMs });
    }
  }
  return { active, expired };
}

export interface UndoCountdownSnapshot {
  id: string;
  remainingSeconds: number;
}

export const DEFAULT_UNDO_DURATION_MS = 5000;

export function createUndoQueueController<T extends { id: string }>(options: {
  durationMs?: number;
  tickMs?: number;
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
  onChange: (items: UndoCountdownSnapshot[]) => void;
  onExpire: (entry: T) => void;
}) {
  const durationMs = options.durationMs ?? DEFAULT_UNDO_DURATION_MS;
  const tickMs = options.tickMs ?? 200;
  const now = options.now ?? (() => Date.now());
  const setIntervalFn = options.setIntervalFn ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearIntervalFn = options.clearIntervalFn ?? ((id) => globalThis.clearInterval(id));

  let entries: Array<T & { remainingMs: number }> = [];
  let paused = false;
  let lastTickAt: number | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let currentOnExpire = options.onExpire;

  function emitChange() {
    options.onChange(
      entries.map((entry) => ({
        id: entry.id,
        remainingSeconds: computeRemainingSeconds(entry.remainingMs),
      })),
    );
  }

  function stopTimer() {
    if (timerId !== null) {
      clearIntervalFn(timerId);
      timerId = null;
    }
    lastTickAt = null;
  }

  function advance(elapsedMs: number) {
    if (entries.length === 0) return;
    const { active, expired } = stepUndoEntries(entries, elapsedMs);
    entries = active;
    if (entries.length === 0) {
      paused = false;
      stopTimer();
    }
    emitChange();
    for (const queued of expired) {
      currentOnExpire(queued);
    }
  }

  function ensureTimer() {
    if (timerId !== null || paused || entries.length === 0) return;
    lastTickAt = now();
    timerId = setIntervalFn(() => {
      const currentNow = now();
      const elapsed = lastTickAt === null ? 0 : Math.max(0, currentNow - lastTickAt);
      lastTickAt = currentNow;
      advance(elapsed);
    }, tickMs);
  }

  return {
    schedule(entry: T) {
      entries = [...entries, { ...entry, remainingMs: durationMs }];
      emitChange();
      ensureTimer();
    },
    pause() {
      if (paused || entries.length === 0) return;
      if (lastTickAt !== null) {
        advance(Math.max(0, now() - lastTickAt));
      }
      if (entries.length === 0) return;
      paused = true;
      stopTimer();
    },
    resume() {
      if (!paused) return;
      paused = false;
      ensureTimer();
    },
    take(id: string): T | null {
      const target = entries.find((item) => item.id === id) ?? null;
      if (!target) return null;
      entries = entries.filter((item) => item.id !== id);
      if (entries.length === 0) {
        paused = false;
        stopTimer();
      }
      emitChange();
      return target;
    },
    flush(): T[] {
      paused = false;
      stopTimer();
      if (entries.length === 0) return [];
      const flushed = entries;
      entries = [];
      return flushed;
    },
    isPaused() {
      return paused;
    },
    setOnExpire(fn: (entry: T) => void) {
      currentOnExpire = fn;
    },
    destroy() {
      paused = false;
      stopTimer();
    },
  };
}
