export const NETWORK_RETRY_MESSAGE = "网络异常，请重试";
export const OCR_FAIL_MESSAGE = "没能识别出来，请手动填写或重新上传";
export const SCREENSHOT_UPLOAD_FAIL_MESSAGE = "截图没能上传，请稍后重试";
export const LOGIN_EXPIRED_MESSAGE = "登录状态已过期，刷新页面后重试";

export const OCR_ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: "操作有点频繁，稍后再试",
  AI_TIMEOUT: "识别超时，稍后重试",
  AI_CHANNEL_UNAVAILABLE: "截图识别暂时不可用，请手动填写或稍后重试",
  AI_EMPTY_RESPONSE: "这次没能识别出结果，请联系管理员",
  AI_PARSE_FAILED: "识别结果读不出来，请手动填写或稍后重试",
  STORAGE_READ_FAILED: "已上传的截图读不出来，请重新上传",
  BLURRY: "图片有点模糊，重新截一张更清晰的",
  NO_TEXT: "没找到文字，确认截图里有数据",
  LOW_CONFIDENCE: "识别得不太准，请手动核对或重新截图",
  TIMEOUT: "识别超时，稍后重试",
  UNKNOWN: "没能识别出来，请手动填写或稍后重试",
};

export function resolveOcrErrorMessage(errorCode?: string | null): string {
  if (!errorCode) return OCR_FAIL_MESSAGE;
  return OCR_ERROR_MESSAGES[errorCode] ?? OCR_ERROR_MESSAGES.UNKNOWN;
}

const SAFE_UPLOAD_MESSAGES = new Set([
  "请上传图片文件",
  "仅支持 jpg、png、webp 图片",
  "图片为空或已损坏，请重新上传",
  "图片不能超过 8MB",
  "图片内容与文件类型不一致或文件已损坏",
  "账号不存在或无权限上传",
]);

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isNetworkErrorMessage(message: string): boolean {
  return /failed to fetch|network|网络异常|网络错误/i.test(message);
}

export function toScreenshotUploadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error).trim();

  if (!message) return SCREENSHOT_UPLOAD_FAIL_MESSAGE;
  if (message === "未登录" || message.includes("登录状态已失效")) return LOGIN_EXPIRED_MESSAGE;
  if (message === NETWORK_RETRY_MESSAGE || isNetworkErrorMessage(message))
    return NETWORK_RETRY_MESSAGE;
  if (SAFE_UPLOAD_MESSAGES.has(message)) return message;
  return SCREENSHOT_UPLOAD_FAIL_MESSAGE;
}

export function toOcrErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error).trim();

  if (!message) return OCR_FAIL_MESSAGE;
  if (message === "未登录" || message.includes("登录状态已失效")) return LOGIN_EXPIRED_MESSAGE;
  if (message === NETWORK_RETRY_MESSAGE || isNetworkErrorMessage(message)) return NETWORK_RETRY_MESSAGE;
  if (OCR_ERROR_MESSAGES[message]) return OCR_ERROR_MESSAGES[message];
  if (Object.values(OCR_ERROR_MESSAGES).includes(message)) return message;
  return OCR_FAIL_MESSAGE;
}
