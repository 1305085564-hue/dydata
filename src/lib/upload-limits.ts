/**
 * 文件上传大小限制常量（字节）
 */
export const UPLOAD_LIMITS = {
  /** 日报截图上传：8MB */
  screenshot: 8 * 1024 * 1024,
  /** 违规截图上传：5MB */
  violationScreenshot: 5 * 1024 * 1024,
  /** OCR 截图识别：8MB */
  ocr: 8 * 1024 * 1024,
} as const;

/**
 * 将字节数格式化为人类可读的字符串（如 "8MB"）
 */
export function formatSizeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${bytes / (1024 * 1024)}MB`;
  }
  if (bytes >= 1024) {
    return `${bytes / 1024}KB`;
  }
  return `${bytes}B`;
}
