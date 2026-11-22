/**
 * 截图识别通道开关的纯解析逻辑。
 * 存储位置：ai_feature_bindings 中 feature_key = 'ocr_screenshot' 行的 channel_settings jsonb。
 * 读取入口在 src/app/api/ocr-screenshot/channel-config.ts，这里保持零依赖可测试。
 */

export type OcrScreenshotChannel = "baidu" | "vision" | "clairic";

export const OCR_CHANNEL_SETTINGS_KEY = "ocr_screenshot_channel";
export const DEFAULT_OCR_SCREENSHOT_CHANNEL: OcrScreenshotChannel = "baidu";

export type OcrChannelSettingsRow = {
  channel_settings?: Record<string, unknown> | null;
};

export function parseOcrChannelValue(value: unknown): OcrScreenshotChannel {
  if (value === "vision" || value === "clairic" || value === "baidu") {
    return value;
  }
  return DEFAULT_OCR_SCREENSHOT_CHANNEL;
}

export function parseOcrScreenshotChannel(
  row: OcrChannelSettingsRow | null | undefined,
): OcrScreenshotChannel {
  const settings = row?.channel_settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return DEFAULT_OCR_SCREENSHOT_CHANNEL;
  }
  return parseOcrChannelValue(settings[OCR_CHANNEL_SETTINGS_KEY]);
}
