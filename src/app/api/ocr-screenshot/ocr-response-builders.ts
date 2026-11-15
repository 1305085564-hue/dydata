import type {
  JsonObject,
  ParsedOcrResult,
  ParsedScreenshotResponse,
  RetentionRecognitionResult,
  ScreenshotType,
} from "./ocr-contract";

const DATA_FIELDS = [
  "play_count",
  "likes",
  "comments",
  "shares",
  "favorites",
  "follower_gain",
] as const;

function attachPublishedAtEvidence(target: JsonObject, publishedAt: ParsedOcrResult["publishedAt"]) {
  if (publishedAt.published_at || publishedAt.published_at_text) Object.assign(target, publishedAt);
  return target;
}

export function buildRetentionScreenshotResponse(
  parsed: RetentionRecognitionResult,
  screenshotType: ScreenshotType,
): ParsedScreenshotResponse {
  if (!parsed.recognized) {
    return { slot_status: "failed", screenshot_type: screenshotType, confidence_score: 0, requires_manual_confirmation: true, error_code: "LOW_CONFIDENCE", error: parsed.reason, recognized_fields: null };
  }
  const confidenceScore = parsed.confidence ?? 0;
  return {
    slot_status: confidenceScore < 0.7 ? "pending_confirm" : "confirmed",
    screenshot_type: screenshotType,
    confidence_score: confidenceScore,
    requires_manual_confirmation: confidenceScore < 0.7,
    recognized_fields: attachPublishedAtEvidence({
      recognized: true,
      retention_metrics: parsed.retention_metrics,
      confidence: parsed.confidence,
      ...(parsed.video_title ? { video_title: parsed.video_title } : {}),
    } as unknown as JsonObject, parsed.publishedAt ?? { published_at: null, published_at_text: null, published_at_confidence: "low" }),
  };
}

export function buildDataScreenshotResponse(
  parsed: ParsedOcrResult,
  screenshotType: ScreenshotType,
  confidenceScore: number,
): ParsedScreenshotResponse {
  const recognizedFields = Object.fromEntries(
    DATA_FIELDS.filter((field) => parsed[field] !== null).map((field) => [field, parsed[field]])
  ) as JsonObject;
  if (parsed.video_title) recognizedFields.video_title = parsed.video_title;
  attachPublishedAtEvidence(recognizedFields, parsed.publishedAt);
  if (DATA_FIELDS.every((field) => parsed[field] === null) && !parsed.video_title) {
    return { slot_status: "failed", screenshot_type: screenshotType, confidence_score: 0, requires_manual_confirmation: true, error_code: "LOW_CONFIDENCE", error: "图片不清晰或未识别到数据", recognized_fields: null };
  }
  return {
    slot_status: confidenceScore < 0.7 ? "pending_confirm" : "confirmed",
    screenshot_type: screenshotType,
    confidence_score: confidenceScore,
    requires_manual_confirmation: confidenceScore < 0.7,
    recognized_fields: recognizedFields,
    confidence: parsed.confidence,
  };
}
