// 识别请求的前端等待上限：服务端总预算 60 秒，前端多留 5 秒再放弃，
// 避免服务端已经给出结果、页面却先一步中止。到点只中止识别请求本身，
// 已经上传成功的截图不受影响（上传用的是各自的 signal）。

/** 比服务端 60 秒略长的前端上限。 */
export const OCR_CLIENT_TIMEOUT_MS = 65_000;

/** 到点后给用户的话：明确是超时，并告诉他还能手动填或重试。 */
export const OCR_TIMEOUT_MESSAGE = "识别超时，请手动填写或重试";

export class OcrTimeoutError extends Error {
  constructor(message: string = OCR_TIMEOUT_MESSAGE) {
    super(message);
    this.name = "OcrTimeoutError";
  }
}

export function isOcrTimeoutError(error: unknown): boolean {
  return error instanceof OcrTimeoutError;
}

export type OcrRequestGuard = {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
};

/**
 * 把"用户取消（换图、离开页面）"和"等太久"分开：两者都会中止请求，
 * 但只有到点才提示超时，取消不该弹"识别超时"。
 */
export function createOcrRequestGuard(
  externalSignal?: AbortSignal,
  timeoutMs: number = OCR_CLIENT_TIMEOUT_MS,
): OcrRequestGuard {
  const controller = new AbortController();
  let timedOut = false;

  const forwardAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) forwardAbort();
    else externalSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    timedOut = true;
    controller.abort(new OcrTimeoutError());
  }, timeoutMs);

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", forwardAbort);
    },
  };
}

/**
 * 统一的识别请求出口：两个页面（提交页、24 小时补录页）都走这里，
 * 这样"到点中止 + 保留已上传截图 + 提示手动填写"只有一份实现。
 */
export async function requestOcr(input: {
  body: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<Response> {
  const guard = createOcrRequestGuard(input.signal, input.timeoutMs);
  try {
    // 调用前就取消（换图、关掉面板）：不白发一次请求。
    if (guard.signal.aborted) {
      throw guard.timedOut() ? new OcrTimeoutError() : new DOMException("This operation was aborted", "AbortError");
    }
    return await fetch("/api/ocr-screenshot", {
      method: "POST",
      body: input.body,
      headers: input.headers,
      signal: guard.signal,
    });
  } catch (error) {
    if (guard.timedOut()) throw new OcrTimeoutError();
    throw error;
  } finally {
    guard.dispose();
  }
}
