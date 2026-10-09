import type { EditableMetricKey, SubmissionFieldSource, SubmissionState, SubmissionIssueSummary } from "./提交状态机";
import type { SubmissionSlotRole } from "./提交状态机";
import { getSlotRoleForMetric } from "@/lib/video-submit/domain/form-rules";
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

export type ScreenshotRefreshDecision = "adopt_ocr" | "keep_manual";

/**
 * 背景：重新上传截图的目的，是让新图识别出来的数字自然替换旧数据。
 * 但 OCR 不一定每个字段都认得出来，而且手改过的数字也可能是有意修正的。
 * 这个函数只回答一个问题——「新图识别值」和「旧手改值」冲突时，听谁的。
 *
 * **Your Task:** 实现下面的 shouldAdoptOcrAfterScreenshotRefresh()，
 * 返回 "adopt_ocr"（用新识别值覆盖）或 "keep_manual"（保留手改值）。
 *
 * **Guidance:** 可以考虑的策略有：
 * - 一律 adopt_ocr：换图等于重新取证，以图为准（最贴合「自然替换很多数据」）
 * - 按置信度：high 用识别值，medium/low 保留手改（防 OCR 看错）
 * - 按差异幅度：识别值和手改值差太多就保留手改，否则用识别值
 * 参数 ocrValue 保证是非空字符串；ocrConfidenceLevel 可能是 null。
 */
export function shouldAdoptOcrAfterScreenshotRefresh(args: {
  ocrValue: string;
  previousManualValue: string;
  ocrConfidenceLevel: ConfidenceLevel | null;
}): ScreenshotRefreshDecision {
  // TODO(human): 这三行是「换图后听谁的」业务规则，只有你能定，改这里即可。
  // 当前默认：换图等于重新取证，一律以新识别值为准（哪怕识别置信度低）。
  void args;
  return "adopt_ocr";
}

/**
 * 把一次 OCR 识别结果并入字段状态：
 * - 识别到值的字段一律用它替换该字段的 OCR 原值（`ocrValue`）；
 * - 只有用户没手打过（`manuallyEdited` 不为真）的字段才刷新当前显示值；
 *   用户手打过的字段保留当前值，等到用户自己点「恢复识别值」再采用；
 * - 识别不到值（识别失败或该字段没识别出来）时原样返回，不擦除既有有效值。
 * - `screenshotRefreshed` 为真（重新上传了截图）时，手改字段改由
 *   `shouldAdoptOcrAfterScreenshotRefresh` 决定听新图还是听手改。
 */
export function applyOcrMetricValues(
  fields: Record<EditableMetricKey, EditableFieldState>,
  recognized: OcrRecognizedValues | null | undefined,
  confidence?: OcrFieldConfidence | null,
  options?: { screenshotRefreshed?: boolean; screenshotRole?: SubmissionSlotRole },
): Record<EditableMetricKey, EditableFieldState> {
  const screenshotRefreshed = options?.screenshotRefreshed === true;
  let next = fields;
  let changed = false;

  if (screenshotRefreshed && options?.screenshotRole) {
    next = { ...fields };
    for (const key of Object.keys(fields) as EditableMetricKey[]) {
      if (getSlotRoleForMetric(key) !== options.screenshotRole) continue;
      next[key] = {
        ...fields[key],
        value: "",
        source: "ocr",
        requiresManualConfirmation: false,
        confirmed: true,
        confidenceScore: null,
        confidenceLevel: null,
        ocrValue: null,
        ocrConfidenceLevel: null,
        manuallyEdited: false,
      };
    }
    changed = true;
  }

  if (!recognized) return changed ? next : fields;

  if (next === fields) next = { ...fields };

  for (const [key, rawValue] of Object.entries(recognized)) {
    if (!(key in next) || !isRecognizedMetricValue(rawValue)) continue;

    const metricKey = key as EditableMetricKey;
    const current = next[metricKey];
    const ocrValue = String(rawValue);
    const ocrConfidenceLevel = confidence?.[metricKey] ?? null;

    if (current.manuallyEdited) {
      const decision = screenshotRefreshed
        ? shouldAdoptOcrAfterScreenshotRefresh({
            ocrValue,
            previousManualValue: current.value,
            ocrConfidenceLevel,
          })
        : "keep_manual";
      if (decision === "keep_manual") {
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
  /** 与 `提交状态机.ts` 的 SubmissionIssueMeta 保持同步（两处类型各存一份） */
  submissionMode?: "create" | "edit" | "abnormal";
  publishedAtConfirmed?: boolean;
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
