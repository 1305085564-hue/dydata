export async function measureAsync<T>(label: string, task: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();

  try {
    return await task();
  } finally {
    if (process.env.DYDATA_PERF_LOG === "1") {
      const durationMs = Math.round(performance.now() - start);
      console.info(`[perf] ${label} ${durationMs}ms`);
    }
  }
}
