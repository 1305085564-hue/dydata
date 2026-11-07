import { createAdminClient } from "@/lib/supabase/admin";
import type { OcrErrorCode } from "./ocr-contract";

export interface OcrLogParams {
  totalMs: number;
  ocrMs?: number | null;
  downloadMs?: number | null;
  channelName?: string | null;
  modelId?: string | null;
  screenshotType?: string | null;
  isSuccess: boolean;
  errorCode?: OcrErrorCode | null;
  userId?: string | null;
}

/**
 * 记录截图识别耗时与渠道测速台账
 * 异常完全吞并，绝不影响前台截图识别业务回执
 */
export async function recordOcrRecognitionLog(params: OcrLogParams): Promise<void> {
  try {
    const adminClient = createAdminClient();
    await adminClient.from("ocr_recognition_logs").insert({
      duration_ms: params.totalMs,
      ocr_ms: params.ocrMs ?? null,
      download_ms: params.downloadMs ?? null,
      channel_name: params.channelName ?? null,
      model_id: params.modelId ?? null,
      screenshot_type: params.screenshotType ?? null,
      is_success: params.isSuccess,
      error_code: params.errorCode ?? null,
      user_id: params.userId ?? null,
    });
  } catch (insertError) {
    console.warn("[ocr_recognition_logs] log insertion failed", insertError);
  }
}
