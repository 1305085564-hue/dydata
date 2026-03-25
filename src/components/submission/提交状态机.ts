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
export type SubmissionIssueAnchor = "slots" | "metrics" | "topicTag" | null;

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
  topicTagMissing: boolean;
  totalIssueCount: number;
  firstIssueAnchor: SubmissionIssueAnchor;
  canSubmit: boolean;
  reason: string | null;
}

interface SubmissionIssueMeta {
  topicTag?: string;
  anomalyStatus?: string;
}

const ALWAYS_REQUIRED_FIELDS: EditableMetricKey[] = [
  "play_count",
  "follower_gain",
  "likes",
  "comments",
  "shares",
  "favorites",
];

const RETENTION_FIELDS: EditableMetricKey[] = [
  "avg_play_duration",
  "bounce_rate_2s",
  "completion_rate_5s",
  "completion_rate",
];

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

function getRequiredFieldKeys(anomalyStatus?: string): EditableMetricKey[] {
  const retentionOptional = anomalyStatus === "限流" || anomalyStatus === "删稿";
  return retentionOptional ? ALWAYS_REQUIRED_FIELDS : [...ALWAYS_REQUIRED_FIELDS, ...RETENTION_FIELDS];
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
  const requiredSlots = Object.values(state.slots).filter((slot) => slot.required);
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

  const requiredFieldKeys = getRequiredFieldKeys(meta.anomalyStatus);
  const missingRequiredFields = requiredFieldKeys.filter((key) => !state.fields[key].value.trim());
  const unconfirmedFields = Object.values(state.fields)
    .filter((field) => field.requiresManualConfirmation && !field.confirmed)
    .filter((field) => !missingRequiredFields.includes(field.key))
    .map((field) => field.key);

  const topicTagMissing = !meta.topicTag?.trim();
  const totalIssueCount =
    missingRequiredSlots.length +
    failedRequiredSlots.length +
    pendingSlotConfirmations.length +
    missingRequiredFields.length +
    unconfirmedFields.length +
    (topicTagMissing ? 1 : 0);

  const firstIssueAnchor: SubmissionIssueAnchor =
    missingRequiredSlots.length > 0 || failedRequiredSlots.length > 0 || pendingSlotConfirmations.length > 0
      ? "slots"
      : missingRequiredFields.length > 0 || unconfirmedFields.length > 0
        ? "metrics"
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
  } else if (missingRequiredFields.length > 0) {
    reason = "请补全必填指标";
  } else if (unconfirmedFields.length > 0) {
    reason = "请先确认低置信字段";
  } else if (topicTagMissing) {
    reason = "请选择话题标签（干货或复盘）";
  }

  return {
    missingRequiredSlots,
    failedRequiredSlots,
    pendingSlotConfirmations,
    missingRequiredFields,
    unconfirmedFields,
    topicTagMissing,
    totalIssueCount,
    firstIssueAnchor,
    canSubmit: totalIssueCount === 0,
    reason,
  };
}

export function canSubmit(state: SubmissionState): { ok: boolean; reason: string | null } {
  const summary = summarizeSubmissionIssues(state);

  if (summary.missingRequiredSlots.length > 0 || summary.failedRequiredSlots.length > 0 || summary.pendingSlotConfirmations.length > 0) {
    return { ok: false, reason: "请先确认必传截图槽位" };
  }

  if (summary.unconfirmedFields.length > 0) {
    return { ok: false, reason: "请先确认低置信字段" };
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

  const hasAnyPendingConfirmation =
    Object.values(state.slots).some(
      (slot) => slot.status === "pending_confirm" || (slot.required && !slot.confirmed && slot.status !== "empty")
    ) ||
    Object.values(state.fields).some(
      (field) => field.requiresManualConfirmation && !field.confirmed
    );

  if (hasAnyPendingConfirmation) {
    return "待确认";
  }

  return "草稿";
}
