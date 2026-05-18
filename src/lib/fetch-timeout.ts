export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const userSignal = options?.signal;
  let onUserAbort: (() => void) | null = null;
  if (userSignal) {
    onUserAbort = () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
    userSignal.addEventListener("abort", onUserAbort);
    if (userSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求超时，请检查网络后重试");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (userSignal && onUserAbort) {
      userSignal.removeEventListener("abort", onUserAbort);
    }
  }
}

export async function fetchWithTimeoutJSON<T>(
  url: string,
  options?: RequestInit,
  timeoutMs = 30000,
): Promise<T> {
  const res = await fetchWithTimeout(url, options, timeoutMs);
  return res.json() as Promise<T>;
}
