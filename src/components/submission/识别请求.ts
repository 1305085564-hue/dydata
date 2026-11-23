import { OCR_TIMEOUT_MESSAGE, isOcrTimeoutError, requestOcr } from "@/lib/ocr-request";

// 24 小时补录页的识别请求：和提交页共用同一套"到点中止"，
// 只是这里不落存储、只把识别出来的六个数字交回去。

export type ConfidenceLevel = "high" | "medium" | "low";

export const OCR_FIELD_KEYS = ["play_count", "likes", "comments", "shares", "favorites", "follower_gain"] as const;

export type OcrFieldKey = (typeof OCR_FIELD_KEYS)[number];

export type ManualImportOcrResult =
  | {
      ok: true;
      /** 只包含识别出非空值的字段，调用方按合并方式覆盖。 */
      values: Partial<Record<OcrFieldKey, string>>;
      confidence: Partial<Record<OcrFieldKey, ConfidenceLevel>>;
    }
  | { ok: false; message: string };

type OcrApiResponse = {
  data?: {
    recognized_fields?: Partial<Record<OcrFieldKey, number | null>> | null;
    confidence?: Partial<Record<OcrFieldKey, ConfidenceLevel>> | null;
  };
  error?: string;
};

export async function runManualImportOcr(
  file: File,
  options: { timeoutMs?: number } = {},
): Promise<ManualImportOcrResult> {
  const formData = new FormData();
  formData.append("file", file);
  // 补 24 小时只回填互动截图上的六个数字，固定按互动识别；识别接口不再接受不带类型的请求
  formData.append("screenshot_type", "data");

  try {
    const response = await requestOcr({ body: formData, timeoutMs: options.timeoutMs });
    const payload = (await response.json().catch(() => ({}))) as OcrApiResponse;

    if (!response.ok || !payload.data) {
      return { ok: false, message: payload.error || "识别失败，请换清晰截图重试" };
    }

    const data = payload.data;
    const values: Partial<Record<OcrFieldKey, string>> = {};
    const confidence: Partial<Record<OcrFieldKey, ConfidenceLevel>> = {};
    for (const key of OCR_FIELD_KEYS) {
      const raw = data.recognized_fields?.[key];
      if (raw == null || String(raw) === "") continue;
      values[key] = String(raw);
      confidence[key] = data.confidence?.[key] ?? "low";
    }
    return { ok: true, values, confidence };
  } catch (error) {
    if (isOcrTimeoutError(error)) return { ok: false, message: OCR_TIMEOUT_MESSAGE };
    const message = error instanceof Error ? error.message : "";
    return { ok: false, message: message || "识别失败，请稍后重试" };
  }
}
