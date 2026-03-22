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

export function canSubmit(state: SubmissionState): { ok: boolean; reason: string | null } {
  const requiredSlots = Object.values(state.slots).filter((slot) => slot.required);
  const hasUnconfirmedRequiredSlot = requiredSlots.some(
    (slot) => slot.status !== "confirmed" || !slot.confirmed
  );

  if (hasUnconfirmedRequiredSlot) {
    return { ok: false, reason: "请先确认必传截图槽位" };
  }

  const hasUnconfirmedLowConfidenceField = Object.values(state.fields).some(
    (field) => field.requiresManualConfirmation && !field.confirmed
  );

  if (hasUnconfirmedLowConfidenceField) {
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
