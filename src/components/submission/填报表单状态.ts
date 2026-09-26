import type { EditableMetricKey, SubmissionFieldSource, SubmissionState, SubmissionIssueSummary } from "./提交状态机";
import { summarizeSubmissionIssues as summarizeBaseIssues } from "./提交状态机";

export type ConfidenceLevel = "high" | "medium" | "low";

export type EditableFieldState = {
  key: EditableMetricKey;
  value: string;
  source: SubmissionFieldSource;
  requiresManualConfirmation: boolean;
  confirmed: boolean;
  confidenceScore?: number | null;
  confidenceLevel?: ConfidenceLevel | null;
  /** 最近一次 OCR 识别到该字段的原始值；null / undefined 表示未知（未识别或旧草稿），不推断历史值。 */
  ocrValue?: string | null;
  /** 与 `ocrValue` 同一时刻的识别置信度，恢复原值时要一起还原。 */
  ocrConfidenceLevel?: ConfidenceLevel | null;
  /** 用户是否在本表单里手打过这个字段。只记录「谁改的」，取值来源仍由 `source` 表示。 */
  manuallyEdited?: boolean;
};

export type OcrFieldConfidence = Partial<Record<EditableMetricKey, ConfidenceLevel>>;

export type OcrRecognizedValues = Record<
  string,
  string | number | boolean | null | undefined
>;

export function mapConfidenceToScore(level?: ConfidenceLevel | null): number {
  if (level === "high") return 1;
  if (level === "medium") return 0.5;
  return 0;
}

function isRecognizedMetricValue(value: unknown): value is string | number {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.trim() !== "";
}

/**
 * 把一次 OCR 识别结果并入字段状态：
 * - 识别到值的字段一律用它替换该字段的 OCR 原值（`ocrValue`）；
 * - 只有用户没手打过（`manuallyEdited` 不为真）的字段才刷新当前显示值；
 *   用户手打过的字段保留当前值，等到用户自己点「恢复识别值」再采用；
 * - 识别不到值（识别失败或该字段没识别出来）时原样返回，不擦除既有有效值。
 */
export function applyOcrMetricValues(
  fields: Record<EditableMetricKey, EditableFieldState>,
  recognized: OcrRecognizedValues | null | undefined,
  confidence?: OcrFieldConfidence | null,
): Record<EditableMetricKey, EditableFieldState> {
  if (!recognized) return fields;

  const next = { ...fields };
  let changed = false;

  for (const [key, rawValue] of Object.entries(recognized)) {
    if (!(key in next) || !isRecognizedMetricValue(rawValue)) continue;

    const metricKey = key as EditableMetricKey;
    const current = next[metricKey];
    const ocrValue = String(rawValue);
    const ocrConfidenceLevel = confidence?.[metricKey] ?? null;

    if (current.manuallyEdited) {
      if (
        current.ocrValue === ocrValue &&
        (current.ocrConfidenceLevel ?? null) === ocrConfidenceLevel
      ) {
        continue;
      }
      next[metricKey] = { ...current, ocrValue, ocrConfidenceLevel };
      changed = true;
      continue;
    }

    next[metricKey] = {
      ...current,
      value: ocrValue,
      source: "ocr",
      requiresManualConfirmation: false,
      confirmed: true,
      confidenceScore: mapConfidenceToScore(ocrConfidenceLevel),
      confidenceLevel: ocrConfidenceLevel,
      ocrValue,
      ocrConfidenceLevel,
      manuallyEdited: false,
    };
    changed = true;
  }

  return changed ? next : fields;
}

export function canRestoreOcrValue(field: EditableFieldState | undefined): boolean {
  if (!field) return false;
  return (
    typeof field.ocrValue === "string" &&
    field.ocrValue !== "" &&
    field.value !== field.ocrValue
  );
}

/**
 * 「恢复识别值」：只把该字段还原成 OCR 原值并交回 OCR 管理（`manuallyEdited` 复位），
 * 不重跑识别、不发请求、不动截图资产，也不影响其他字段。
 */
export function restoreOcrFieldValue(field: EditableFieldState): EditableFieldState {
  if (!canRestoreOcrValue(field)) return field;

  const ocrValue = field.ocrValue as string;
  const confidenceLevel = field.ocrConfidenceLevel ?? null;

  return {
    ...field,
    value: ocrValue,
    source: "ocr",
    requiresManualConfirmation: false,
    confirmed: true,
    confidenceScore: mapConfidenceToScore(confidenceLevel),
    confidenceLevel,
    manuallyEdited: false,
  };
}

export type FirstInvalidFieldKey =
  | EditableMetricKey
  | "videoTitle"
  | "content"
  | "topicTag"
  | null;

export type ExtendedSubmissionIssueSummary = SubmissionIssueSummary & {
  firstInvalidFieldKey: FirstInvalidFieldKey;
};

export interface SubmissionIssueMetaInput {
  topicTag?: string;
  anomalyStatus?: string;
  videoTitle?: string;
  content?: string;
  contentKeywords?: string[];
}

export function summarizeSubmissionIssues(
  state: SubmissionState,
  meta: SubmissionIssueMetaInput = {}
): ExtendedSubmissionIssueSummary {
  const baseSummary = summarizeBaseIssues(state, meta);

  let firstInvalidFieldKey: FirstInvalidFieldKey = null;
  if (
    baseSummary.missingRequiredSlots.length > 0 ||
    baseSummary.processingRequiredSlots.length > 0 ||
    baseSummary.failedRequiredSlots.length > 0
  ) {
    firstInvalidFieldKey = null;
  } else if (baseSummary.missingRequiredMetrics.length > 0) {
    firstInvalidFieldKey = baseSummary.missingRequiredMetrics[0];
  } else if (baseSummary.missingRequiredMeta.length > 0) {
    firstInvalidFieldKey = baseSummary.missingRequiredMeta[0];
  } else if (baseSummary.topicTagMissing) {
    firstInvalidFieldKey = "topicTag";
  }

  return {
    ...baseSummary,
    firstInvalidFieldKey,
  };
}

export function isInteractionExceedingPlayCount(fields: {
  play_count: string | number | null;
  likes: string | number | null;
  comments: string | number | null;
  shares: string | number | null;
  favorites: string | number | null;
}): { exceeded: boolean; interactions: number; playCount: number } {
  const playCount = Number(fields.play_count || 0);
  const likes = Number(fields.likes || 0);
  const comments = Number(fields.comments || 0);
  const shares = Number(fields.shares || 0);
  const favorites = Number(fields.favorites || 0);
  const interactions = likes + comments + shares + favorites;
  const exceeded = playCount > 0 && interactions > playCount;
  return { exceeded, interactions, playCount };
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRecentBizDateRange(today: string): string[] {
  const [year, month, day] = today.split("-").map(Number);
  const current = new Date(year, (month || 1) - 1, day || 1);
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(current);
    next.setDate(current.getDate() - (6 - index));
    return formatDateKey(next);
  });
}

export function isBizDateSelectable(today: string, value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return value <= today;
}

export function getBizDateHelperText(value: string): string | null {
  if (!value) {
    return null;
  }

  const day = new Date(`${value}T00:00:00`).getDay();
  return day === 0 || day === 6 ? "周末内容，数据可在周一上传" : null;
}

export function formatHourText(value: string): string {
  if (!value) {
    return "";
  }

  const [, time = ""] = value.split("T");
  const [hourText = "", minuteText = ""] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return "";
  }

  if (minute === 0) {
    return `${hour}点`;
  }

  return `${hour}点${minute}分`;
}

export function syncPublishedAtAndText(args: {
  nextPublishedAt: string;
  nextPublishedAtText: string;
  changedField: "published_at" | "published_at_text";
}) {
  if (args.changedField === "published_at") {
    return {
      publishedAt: args.nextPublishedAt,
      publishedAtText: args.nextPublishedAtText.trim() || formatHourText(args.nextPublishedAt),
    };
  }

  return {
    publishedAt: args.nextPublishedAt,
    publishedAtText: args.nextPublishedAtText,
  };
}

export function toManualFieldState(field: EditableFieldState): EditableFieldState {
  return {
    ...field,
    source: "manual",
    requiresManualConfirmation: false,
    confirmed: true,
    confidenceLevel: null,
    manuallyEdited: true,
  };
}

export type { EditableMetricKey };
