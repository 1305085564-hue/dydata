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

const RETENTION_FIELDS = [
  "avg_play_duration",
  "avg_play_ratio",
  "bounce_rate_2s",
  "completion_rate_5s",
  "completion_rate",
] as const;

function hasRecognizedValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function attachPublishedAtEvidence(target: JsonObject, publishedAt: ParsedOcrResult["publishedAt"]) {
  if (publishedAt.published_at || publishedAt.published_at_text) Object.assign(target, publishedAt);
  return target;
}

export function buildDataClassificationFields(parsed: ParsedOcrResult | null): JsonObject {
  if (!parsed) return {};
  return Object.fromEntries(DATA_FIELDS.map((field) => [field, parsed[field]])) as JsonObject;
}

export function classifyScreenshotByFields(parsed: unknown): ScreenshotType | null {
  const source = isRecord(parsed) && isRecord(parsed.recognized_fields)
    ? parsed.recognized_fields
    : isRecord(parsed) ? parsed : {};
  const dataCount = DATA_FIELDS.filter((field) => hasRecognizedValue(source[field])).length;
  const retention = isRecord(source.retention_metrics) ? source.retention_metrics : {};
  const retentionCount = RETENTION_FIELDS.filter((field) => hasRecognizedValue(retention[field])).length;
  if (dataCount >= 2 && dataCount > retentionCount) return "data";
  if (retentionCount >= 2 && retentionCount > dataCount) return "retention";
  return null;
}

export function buildAutoRecognizedFields(
  dataParsed: ParsedOcrResult | null,
  retentionParsed: RetentionRecognitionResult | null,
): JsonObject {
  const recognizedFields: JsonObject = {
    ...buildDataClassificationFields(dataParsed),
    retention_metrics: retentionParsed?.recognized ? retentionParsed.retention_metrics as unknown as JsonObject : null,
  };
  const title = dataParsed?.video_title ?? (retentionParsed?.recognized ? retentionParsed.video_title ?? null : null);
  if (title) recognizedFields.video_title = title;
  const publishedAt = dataParsed?.publishedAt ?? (retentionParsed?.recognized ? retentionParsed.publishedAt : undefined);
  if (publishedAt) attachPublishedAtEvidence(recognizedFields, publishedAt);
  return recognizedFields;
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
