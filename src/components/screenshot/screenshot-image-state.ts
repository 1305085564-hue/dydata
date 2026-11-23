/**
 * 截图加载失败的自动重试状态机（纯函数，便于单测）。
 *
 * 为什么要自动重试一次：`onError` 不等于「对象不存在」，网络抖动、代理超时、
 * 偶发 502 都会触发。若第一次失败就直接判定「截图无法显示」，会把一张好图
 * 说成坏图——这比裂图更糟。所以先无感重试一次，第二次仍失败才降级。
 */
export type ScreenshotImageStatus = "loading" | "retrying" | "probing" | "failed";

export interface ScreenshotImageState {
  /** 已经用掉的自动重试次数 */
  attempts: number;
  status: ScreenshotImageStatus;
}

export const SCREENSHOT_MAX_AUTO_RETRY = 1;
export const SCREENSHOT_RETRY_DELAY_MS = 400;

export const initialScreenshotImageState: ScreenshotImageState = {
  attempts: 0,
  status: "loading",
};

export type ScreenshotErrorDecision = {
  state: ScreenshotImageState;
  /** true 表示还要排一次延时重试，false 表示先探测最终失败原因 */
  retry: boolean;
};

export function onScreenshotError(state: ScreenshotImageState): ScreenshotErrorDecision {
  if (state.attempts >= SCREENSHOT_MAX_AUTO_RETRY) {
    // 终次失败后先探测响应状态码。探测完成前不能渲染默认的「点击重试」占位。
    return { state: { attempts: state.attempts, status: "probing" }, retry: false };
  }
  return { state: { attempts: state.attempts + 1, status: "retrying" }, retry: true };
}

export function onScreenshotLoaded(): ScreenshotImageState {
  return initialScreenshotImageState;
}

/** 占位态下用户主动点「点击重试」，重置为可再次尝试的初始态 */
export function onScreenshotManualRetry(): ScreenshotImageState {
  return initialScreenshotImageState;
}

export function shouldRenderScreenshotPlaceholder(status: ScreenshotImageStatus) {
  return status === "failed";
}

export function onScreenshotFailureProbed(
  reason: ScreenshotFailureReason,
): { status: "failed"; reason: ScreenshotFailureReason } {
  return { status: "failed", reason };
}

/**
 * 占位时到底该说什么：图真的没了，还是这次没读到。
 *
 * `<img onError>` 分不清这两种——404 和断网、502 都只是一个 error 事件。
 * 所以失败后再向同一地址问一次状态码：只有明确的 404 才说「原图已丢失」，
 * 其余（超时、5xx、请求本身失败）都按「暂时读不到」处理，保留重试入口。
 * 2026-05 的 384 张原图本体确实已不存在，写成「暂时无法读取」会让人一直重试。
 */
export type ScreenshotFailureReason = "missing" | "unavailable";

export function classifyScreenshotStatus(status: number | null): ScreenshotFailureReason {
  return status === 404 ? "missing" : "unavailable";
}

/** 失败判定用的状态码探测：网络异常一律算「暂时读不到」，不冒充文件缺失。 */
export async function probeScreenshotFailureReason(
  src: string,
  request: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<ScreenshotFailureReason> {
  try {
    const response = await request(src, { cache: "no-store" });
    await response.body?.cancel().catch(() => undefined);
    return classifyScreenshotStatus(response.status);
  } catch {
    return "unavailable";
  }
}
