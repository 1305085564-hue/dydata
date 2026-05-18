export const NETWORK_RETRY_MESSAGE = "网络异常，请重试";
export const OCR_FAIL_MESSAGE = "识别失败，请手动填写或重新上传";

export const OCR_ERROR_MESSAGES: Record<string, string> = {
  BLURRY: "图片模糊，请重新截图确保文字清晰",
  NO_TEXT: "未识别到文字内容，请检查截图是否包含数据",
  LOW_CONFIDENCE: "识别置信度低，请手动核对或重新截图",
  TIMEOUT: "识别超时，请检查网络后重试",
  UNKNOWN: "识别失败，请手动填写或稍后重试",
};

export function resolveOcrErrorMessage(errorCode?: string | null): string {
  if (!errorCode) return OCR_FAIL_MESSAGE;
  return OCR_ERROR_MESSAGES[errorCode] ?? OCR_ERROR_MESSAGES.UNKNOWN;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isNetworkErrorMessage(message: string): boolean {
  return /failed to fetch|network|网络异常|网络错误/i.test(message);
}

export function toSlotUploadErrorMessage(error: unknown): string {
  const message = extractErrorMessage(error).trim();

  if (!message) return OCR_FAIL_MESSAGE;
  if (message.includes("登录状态已失效")) return message;
  if (message === NETWORK_RETRY_MESSAGE || isNetworkErrorMessage(message))
    return NETWORK_RETRY_MESSAGE;
  return message;
}
