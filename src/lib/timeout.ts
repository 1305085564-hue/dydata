import { AppError } from "./errors";

export type TimeoutOptions = {
  timeoutMs: number;
  operation?: string;
  signal?: AbortSignal;
};

export async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  options: TimeoutOptions,
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AppError({
        code: "TIMEOUT",
        message: `${options.operation ?? "operation"} timed out after ${timeoutMs}ms`,
        publicMessage: "请求超时，请稍后重试",
        operation: options.operation,
      }));
    }, timeoutMs);
  });

  if (options.signal) {
    onAbort = () => controller.abort();
    options.signal.addEventListener("abort", onAbort, { once: true });
    if (options.signal.aborted) controller.abort();
  }

  try {
    return await Promise.race([task(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    if (options.signal && onAbort) options.signal.removeEventListener("abort", onAbort);
  }
}
