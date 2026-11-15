type ActiveTask = {
  requestId: number;
  controller: AbortController;
  assetUrl: string | null;
};

export type OcrTaskHandle = {
  requestId: number;
  signal: AbortSignal;
  bindAsset: (assetUrl: string) => void;
  isCurrent: (assetUrl?: string) => boolean;
};

export type OcrTaskRegistry = {
  begin: (key: string) => OcrTaskHandle;
  finish: (key: string, requestId: number) => void;
  cancel: (key: string) => void;
  cancelAll: () => void;
};

export function createOcrTaskRegistry(): OcrTaskRegistry {
  const counters = new Map<string, number>(); // gate:transient-map per-item request counters are bounded by active upload lifetime
  const active = new Map<string, ActiveTask>(); // gate:transient-map active OCR tasks are cleared on finish, cancel, or cancelAll

  function cancel(key: string) {
    active.get(key)?.controller.abort();
    active.delete(key);
  }

  function begin(key: string): OcrTaskHandle {
    cancel(key);
    const requestId = (counters.get(key) ?? 0) + 1;
    counters.set(key, requestId);
    const task: ActiveTask = {
      requestId,
      controller: new AbortController(),
      assetUrl: null,
    };
    active.set(key, task);

    return {
      requestId,
      signal: task.controller.signal,
      bindAsset(assetUrl) {
        if (active.get(key)?.requestId === requestId) {
          task.assetUrl = assetUrl;
        }
      },
      isCurrent(assetUrl) {
        const current = active.get(key);
        if (!current || current.requestId !== requestId || task.controller.signal.aborted) {
          return false;
        }
        return assetUrl === undefined || current.assetUrl === assetUrl;
      },
    };
  }

  function finish(key: string, requestId: number) {
    const current = active.get(key);
    if (current?.requestId === requestId) active.delete(key);
  }

  function cancelAll() {
    for (const key of active.keys()) cancel(key);
  }

  return { begin, finish, cancel, cancelAll };
}
