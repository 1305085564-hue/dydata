import type { SubmissionSlotRole } from "@/components/submission/提交状态机";

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
  begin: (role: SubmissionSlotRole) => OcrTaskHandle;
  finish: (role: SubmissionSlotRole, requestId: number) => void;
  cancel: (role: SubmissionSlotRole) => void;
};

export function createOcrTaskRegistry(): OcrTaskRegistry {
  const counters: Record<SubmissionSlotRole, number> = {
    screenshot_1: 0,
    screenshot_2: 0,
  };
  const active = new Map<SubmissionSlotRole, ActiveTask>();

  function cancel(role: SubmissionSlotRole) {
    active.get(role)?.controller.abort();
    active.delete(role);
  }

  function begin(role: SubmissionSlotRole): OcrTaskHandle {
    cancel(role);
    const requestId = counters[role] + 1;
    counters[role] = requestId;
    const task: ActiveTask = {
      requestId,
      controller: new AbortController(),
      assetUrl: null,
    };
    active.set(role, task);

    return {
      requestId,
      signal: task.controller.signal,
      bindAsset(assetUrl) {
        if (active.get(role)?.requestId === requestId) {
          task.assetUrl = assetUrl;
        }
      },
      isCurrent(assetUrl) {
        const current = active.get(role);
        if (!current || current.requestId !== requestId || task.controller.signal.aborted) {
          return false;
        }
        return assetUrl === undefined || current.assetUrl === assetUrl;
      },
    };
  }

  function finish(role: SubmissionSlotRole, requestId: number) {
    const current = active.get(role);
    if (current?.requestId === requestId) active.delete(role);
  }

  return { begin, finish, cancel };
}
