/**
 * 截图加载失败的自动重试状态机（纯函数，便于单测）。
 *
 * 为什么要自动重试一次：`onError` 不等于「对象不存在」，网络抖动、代理超时、
 * 偶发 502 都会触发。若第一次失败就直接判定「截图无法显示」，会把一张好图
 * 说成坏图——这比裂图更糟。所以先无感重试一次，第二次仍失败才降级。
 */
export type ScreenshotImageStatus = "loading" | "retrying" | "failed";

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
  /** true 表示还要排一次延时重试，false 表示已经放到占位图 */
  retry: boolean;
};

export function onScreenshotError(state: ScreenshotImageState): ScreenshotErrorDecision {
  if (state.attempts >= SCREENSHOT_MAX_AUTO_RETRY) {
    return { state: { attempts: state.attempts, status: "failed" }, retry: false };
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
