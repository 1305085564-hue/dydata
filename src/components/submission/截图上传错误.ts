export const NETWORK_RETRY_MESSAGE = "网络异常，请重试";
export const OCR_FAIL_MESSAGE = "识别失败，请手动填写或重新上传";

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
  if (message === NETWORK_RETRY_MESSAGE || isNetworkErrorMessage(message)) return NETWORK_RETRY_MESSAGE;
  return message;
}
