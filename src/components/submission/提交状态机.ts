import { normalizeVideoAnomalyStatus } from "@/lib/video-anomaly";

export type SubmissionSlotRole = "screenshot_1" | "screenshot_2";

export type SubmissionSlotStatus =
  | "empty"
  | "uploading"
  | "recognizing"
  | "pending_confirm"
  | "confirmed"
  | "failed";

export type EditableMetricKey =
  | "play_count"
  | "follower_gain"
  | "follower_convert"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "avg_play_duration"
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "completion_rate";

export type SubmissionFieldSource = "ocr" | "manual";
export type SubmissionStage = "草稿" | "识别中" | "待确认" | "可提交" | "已提交";
export type SubmissionIssueAnchor = "slots" | "metrics" | "topicTag" | "meta" | null;
export type RequiredMetaKey = "videoTitle" | "content";

export const REQUIRED_METRIC_KEYS: EditableMetricKey[] = [
  "play_count",
  "follower_gain",
  "likes",
  "comments",
  "shares",
  "favorites",
];

/**
 * 发布时间未确认时唯一可行的动作是换一张能看清「发布」时间的完播截图
 * （发布时间已锁死为「以完播截图识别为准」，没有手工输入入口）。
 * 文案保持单一来源，供就绪判定、按钮提示与上传后的即时反馈共用。
 */
export const PUBLISHED_AT_UNCONFIRMED_REASON =
  "未识别到发布时间，请重新上传能看清“发布”时间的完播截图";

export interface SubmissionSlotState {
  role: SubmissionSlotRole;
  required: boolean;
  status: SubmissionSlotStatus;
  confidenceScore: number | null;
  requiresManualConfirmation: boolean;
  confirmed: boolean;
}

export interface SubmissionFieldState {
  key: EditableMetricKey;
  value: string;
  source: SubmissionFieldSource;
  requiresManualConfirmation: boolean;
  confirmed: boolean;
  confidenceScore?: number | null;
}

export interface SubmissionState {
  slots: Record<SubmissionSlotRole, SubmissionSlotState>;
  fields: Record<EditableMetricKey, SubmissionFieldState>;
  submitted: boolean;
}

export interface SubmissionIssueSummary {
  missingRequiredSlots: SubmissionSlotRole[];
  processingRequiredSlots: SubmissionSlotRole[];
  failedRequiredSlots: SubmissionSlotRole[];
  unconfirmedSlots: SubmissionSlotRole[];
  missingRequiredMetrics: EditableMetricKey[];
  missingRequiredMeta: RequiredMetaKey[];
  topicTagMissing: boolean;
  /** 发布时间未确认（OCR 未识别到）——后端会以 requires_confirmation 拒绝，必须提前暴露 */
  publishedAtUnconfirmed: boolean;
  totalIssueCount: number;
  firstIssueAnchor: SubmissionIssueAnchor;
  canSubmit: boolean;
  reason: string | null;
}

interface SubmissionIssueMeta {
  topicTag?: string;
  anomalyStatus?: string;
  videoTitle?: string;
  content?: string;
  contentKeywords?: string[];
  /**
   * 与后端 `resolveVideoSubmitMode` 同源的提交模式。只有 "create" 需要确认发布时间：
   * "edit"（编辑历史）与 "abnormal"（异常上报）在后端都跳过发布时间门禁。
   * 不传即视为不校验，保持既有调用方行为不变。
   */
  submissionMode?: "create" | "edit" | "abnormal";
  /** 由 `isPublishedAtConfirmed(meta.publishedAtText)` 得出；不传即视为不校验 */
  publishedAtConfirmed?: boolean;
}

export function areSubmissionScreenshotsRequired(anomalyStatus?: string) {
  return normalizeVideoAnomalyStatus(anomalyStatus) === "normal";
}

function createSlot(role: SubmissionSlotRole, required: boolean): SubmissionSlotState {
  return {
    role,
    required,
    status: "empty",
    confidenceScore: null,
    requiresManualConfirmation: false,
    confirmed: false,
  };
}

function createField(key: EditableMetricKey): SubmissionFieldState {
  return {
    key,
    value: "",
    source: "manual",
    requiresManualConfirmation: false,
    confirmed: true,
    confidenceScore: null,
  };
}

export function createInitialSubmissionState(
  overrides: Partial<SubmissionState> = {}
): SubmissionState {
  return {
    slots: {
      screenshot_1: createSlot("screenshot_1", true),
      screenshot_2: createSlot("screenshot_2", true),
      ...overrides.slots,
    },
    fields: {
      play_count: createField("play_count"),
      follower_gain: createField("follower_gain"),
      follower_convert: createField("follower_convert"),
      likes: createField("likes"),
      comments: createField("comments"),
      shares: createField("shares"),
      favorites: createField("favorites"),
      avg_play_duration: createField("avg_play_duration"),
      bounce_rate_2s: createField("bounce_rate_2s"),
      completion_rate_5s: createField("completion_rate_5s"),
      completion_rate: createField("completion_rate"),
      ...overrides.fields,
    },
    submitted: overrides.submitted ?? false,
  };
}

export function summarizeSubmissionIssues(
  state: SubmissionState,
  meta: SubmissionIssueMeta = {}
): SubmissionIssueSummary {
  const screenshotsRequired = areSubmissionScreenshotsRequired(meta.anomalyStatus);
  const requiredSlots = screenshotsRequired
    ? Object.values(state.slots).filter((slot) => slot.required)
    : [];
  const missingRequiredSlots = requiredSlots
    .filter((slot) => slot.status === "empty")
    .map((slot) => slot.role);
  const processingRequiredSlots = requiredSlots
    .filter((slot) => slot.status === "uploading" || slot.status === "recognizing")
    .map((slot) => slot.role);
  const failedRequiredSlots = requiredSlots
    .filter((slot) => slot.status === "failed" && !slot.confirmed)
    .map((slot) => slot.role);
  const unconfirmedSlots = Object.values(state.slots)
    .filter(
      (slot) =>
        (slot.status === "pending_confirm" || slot.status === "confirmed") &&
        !slot.confirmed
    )
    .map((slot) => slot.role);
  const missingRequiredMetrics = REQUIRED_METRIC_KEYS.filter((key) => !state.fields[key].value.trim());

  const topicTagMissing = meta.topicTag !== undefined ? !meta.topicTag.trim() : false;
  const missingRequiredMeta: RequiredMetaKey[] = [];

  if (meta.anomalyStatus !== "abnormal" && meta.videoTitle !== undefined && !meta.videoTitle.trim()) {
    missingRequiredMeta.push("videoTitle");
  }
  if (meta.content !== undefined && !meta.content.trim()) {
    missingRequiredMeta.push("content");
  }

  // 后端对发布时间的要求（video-submit-deadline.ts 的 requires_confirmation）
  // 排在 72 小时判定之前：未确认时一律 409，用户连「申请补交」都拿不到。
  // 所以必须在点提交之前就暴露，且只在后端同样会拦的模式下暴露。
  const publishedAtUnconfirmed =
    meta.publishedAtConfirmed === false && meta.submissionMode === "create";

  const totalIssueCount =
    missingRequiredSlots.length +
    processingRequiredSlots.length +
    failedRequiredSlots.length +
    missingRequiredMetrics.length +
    missingRequiredMeta.length +
    (topicTagMissing ? 1 : 0) +
    (publishedAtUnconfirmed ? 1 : 0);

  const firstIssueAnchor: SubmissionIssueAnchor =
    missingRequiredSlots.length > 0 || processingRequiredSlots.length > 0 || failedRequiredSlots.length > 0
      ? "slots"
      : missingRequiredMetrics.length > 0
        ? "metrics"
        : missingRequiredMeta.length > 0
          ? "meta"
          : topicTagMissing
            ? "topicTag"
            : publishedAtUnconfirmed
              ? "meta"
              : null;

  let reason: string | null = null;
  if (processingRequiredSlots.length > 0) {
    reason = "截图正在上传或识别，请稍候";
  } else if (missingRequiredSlots.length > 0) {
    reason = "请先上传必传截图";
  } else if (failedRequiredSlots.length > 0) {
    reason = "请先处理识别失败的截图";
  } else if (missingRequiredMetrics.length > 0) {
    reason = `请补全 ${missingRequiredMetrics.length} 项必填指标（留空不再视为 0）`;
  } else if (missingRequiredMeta.length > 0) {
    reason = "请补全标题和文案";
  } else if (topicTagMissing) {
    reason = "请选择话题标签（干货或复盘）";
  } else if (publishedAtUnconfirmed) {
    reason = PUBLISHED_AT_UNCONFIRMED_REASON;
  }

  return {
    missingRequiredSlots,
    processingRequiredSlots,
    failedRequiredSlots,
    unconfirmedSlots,
    missingRequiredMetrics,
    missingRequiredMeta,
    topicTagMissing,
    publishedAtUnconfirmed,
    totalIssueCount,
    firstIssueAnchor,
    canSubmit: totalIssueCount === 0,
    reason,
  };
}

export function canSubmit(
  state: SubmissionState,
  meta: SubmissionIssueMeta = {}
): { ok: boolean; reason: string | null } {
  const summary = summarizeSubmissionIssues(state, meta);

  if (summary.processingRequiredSlots.length > 0) {
    return { ok: false, reason: summary.reason };
  }
  if (summary.missingRequiredSlots.length > 0) {
    return { ok: false, reason: summary.reason };
  }
  if (summary.failedRequiredSlots.length > 0) {
    return { ok: false, reason: "请先处理识别失败的截图" };
  }
  if (summary.missingRequiredMetrics.length > 0) {
    return { ok: false, reason: summary.reason };
  }
  if (summary.missingRequiredMeta.length > 0 || summary.topicTagMissing) {
    return { ok: false, reason: summary.reason };
  }
  if (summary.publishedAtUnconfirmed) {
    return { ok: false, reason: PUBLISHED_AT_UNCONFIRMED_REASON };
  }

  return { ok: true, reason: null };
}

export function getSubmissionStage(state: SubmissionState): SubmissionStage {
  if (state.submitted) {
    return "已提交";
  }

  const hasProcessingSlot = Object.values(state.slots).some(
    (slot) => slot.status === "uploading" || slot.status === "recognizing"
  );

  if (hasProcessingSlot) {
    return "识别中";
  }

  const submissionResult = canSubmit(state);
  if (submissionResult.ok) {
    return "可提交";
  }

  const summary = summarizeSubmissionIssues(state);
  const hasBlockingSlotIssue = summary.missingRequiredSlots.length > 0 || summary.failedRequiredSlots.length > 0;
  const hasStartedSubmission =
    Object.values(state.slots).some((slot) => slot.status !== "empty") ||
    Object.values(state.fields).some((field) => field.value.trim());

  if (hasBlockingSlotIssue && hasStartedSubmission) {
    return "待确认";
  }

  return "草稿";
}
