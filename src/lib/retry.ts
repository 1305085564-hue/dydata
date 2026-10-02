import { AppError } from "./errors";

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  operation?: string;
  sleep?: (delayMs: number) => Promise<void>;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

const defaultSleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export function isRetryableError(error: unknown) {
  if (error instanceof AppError) return error.code === "TIMEOUT" || error.code === "DEPENDENCY_FAILED";
  if (error && typeof error === "object") {
    const value = error as { status?: number; code?: string };
    if (value.code === "ETIMEDOUT" || value.code === "ECONNRESET" || value.code === "ECONNREFUSED") return true;
    return typeof value.status === "number" && (value.status === 408 || value.status === 429 || value.status >= 500);
  }
  return false;
}

export async function withRetry<T>(task: (attempt: number) => Promise<T>, options: RetryOptions = {}) {
  const maxAttempts = Math.min(3, Math.max(1, Math.floor(options.maxAttempts ?? 3)));
  const baseDelayMs = Math.max(0, Math.floor(options.baseDelayMs ?? 100));
  const maxDelayMs = Math.max(baseDelayMs, Math.floor(options.maxDelayMs ?? 1_000));
  const shouldRetry = options.shouldRetry ?? ((error) => isRetryableError(error));
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) throw error;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${options.operation ?? "operation"} failed`);
}
