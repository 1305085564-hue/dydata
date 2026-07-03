export type SubmissionSlotRole =
  | "screenshot_1"
  | "screenshot_2"
  | "screenshot_3";

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
  failedRequiredSlots: SubmissionSlotRole[];
  pendingSlotConfirmations: SubmissionSlotRole[];
  missingRequiredFields: EditableMetricKey[];
  unconfirmedFields: EditableMetricKey[];
  missingRequiredMeta: RequiredMetaKey[];
  topicTagMissing: boolean;
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
}

export function areSubmissionScreenshotsRequired(anomalyStatus?: string) {
  const normalized = anomalyStatus?.trim();
  return !normalized || normalized === "正常";
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
      screenshot_3: createSlot("screenshot_3", false),
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
  const failedRequiredSlots = requiredSlots
    .filter((slot) => slot.status === "failed")
    .map((slot) => slot.role);
  const pendingSlotConfirmations = requiredSlots
    .filter(
      (slot) =>
        slot.status === "pending_confirm" ||
        ((slot.status === "uploading" || slot.status === "recognizing" || slot.status === "confirmed") && !slot.confirmed)
    )
    .map((slot) => slot.role);

  const isAbnormal = meta.anomalyStatus === "限流" || meta.anomalyStatus === "删稿";
  const topicTagMissing = meta.topicTag !== undefined && !isAbnormal ? !meta.topicTag.trim() : false;
  const missingRequiredMeta: RequiredMetaKey[] = [];

  if (meta.videoTitle !== undefined && !meta.videoTitle.trim()) {
    missingRequiredMeta.push("videoTitle");
  }
  if (meta.content !== undefined && !meta.content.trim()) {
    missingRequiredMeta.push("content");
  }

  const totalIssueCount =
    missingRequiredSlots.length +
    failedRequiredSlots.length +
    pendingSlotConfirmations.length +
    missingRequiredMeta.length +
    (topicTagMissing ? 1 : 0);

  const firstIssueAnchor: SubmissionIssueAnchor =
    missingRequiredSlots.length > 0 || failedRequiredSlots.length > 0 || pendingSlotConfirmations.length > 0
      ? "slots"
      : missingRequiredMeta.length > 0
        ? "meta"
        : topicTagMissing
          ? "topicTag"
          : null;

  let reason: string | null = null;
  if (missingRequiredSlots.length > 0) {
    reason = "请先上传必传截图";
  } else if (failedRequiredSlots.length > 0) {
    reason = "请先处理识别失败的截图";
  } else if (pendingSlotConfirmations.length > 0) {
    reason = "请先确认必传截图槽位";
  } else if (missingRequiredMeta.length > 0) {
    reason = "请补全标题和文案";
  } else if (topicTagMissing) {
    reason = "请选择话题标签（干货或复盘）";
  }

  return {
    missingRequiredSlots,
    failedRequiredSlots,
    pendingSlotConfirmations,
    missingRequiredFields: [],
    unconfirmedFields: [],
    missingRequiredMeta,
    topicTagMissing,
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

  if (summary.missingRequiredSlots.length > 0 || summary.failedRequiredSlots.length > 0 || summary.pendingSlotConfirmations.length > 0) {
    return { ok: false, reason: "请先确认必传截图槽位" };
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

  const hasAnyPendingConfirmation = Object.values(state.slots).some(
    (slot) => slot.status === "pending_confirm" || (slot.required && !slot.confirmed && slot.status !== "empty")
  );

  if (hasAnyPendingConfirmation) {
    return "待确认";
  }

  return "草稿";
}
