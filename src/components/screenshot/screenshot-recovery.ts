/** 快重试耗尽后的两轮恢复。只读图，不无限轮询；联网事件也共用这个预算。 */
export const SCREENSHOT_RECOVERY_DELAYS_MS = [2_000, 10_000] as const;

type Dependencies<Timer> = {
  retry: () => void;
  isOnline: () => boolean;
  schedule: (run: () => void, delay: number) => Timer;
  cancel: (timer: Timer) => void;
};

export function createScreenshotRecovery<Timer>(dependencies: Dependencies<Timer>) {
  let timer: Timer | null = null;
  let failed = false;
  let disposed = false;
  let attempts = 0;
  let wasOffline = false;
  const cancel = () => {
    if (timer !== null) dependencies.cancel(timer);
    timer = null;
  };
  const retry = () => {
    cancel();
    if (disposed || !failed || attempts >= SCREENSHOT_RECOVERY_DELAYS_MS.length || !dependencies.isOnline()) return;
    failed = false; // 同一轮只发一次；重复 online 事件不能并发请求。
    attempts++;
    dependencies.retry();
  };
  return {
    failed() {
      if (disposed) return;
      failed = true;
      if (!dependencies.isOnline()) wasOffline = true;
      if (timer !== null || attempts >= SCREENSHOT_RECOVERY_DELAYS_MS.length || !dependencies.isOnline()) return;
      timer = dependencies.schedule(retry, SCREENSHOT_RECOVERY_DELAYS_MS[attempts]);
    },
    offline() {
      if (disposed || dependencies.isOnline()) return;
      wasOffline = true;
      cancel();
    },
    online() {
      if (disposed || !dependencies.isOnline()) return;
      // 真实断网后重新联网是新一轮恢复机会，重复online事件不会刷新预算。
      if (wasOffline) {
        wasOffline = false;
        attempts = 0;
      }
      retry();
    },
    loaded() {
      cancel();
      failed = false;
      attempts = 0;
      wasOffline = false;
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
