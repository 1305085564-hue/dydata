import type { AnomalyStatus } from "@/types";
import {
  createInitialSubmissionState,
  type EditableMetricKey,
  type SubmissionFieldState,
  type SubmissionSlotRole,
  type SubmissionState,
} from "@/components/submission/提交状态机";
import {
  buildVideoSubmissionEditRefill,
  getDefaultPublishedAtForBizDate,
  type ScreenshotUploadSlotRole,
  type SubmissionAssigneeRole,
  type VideoSubmissionEditDetail,
} from "./video-submit-form-state";

export type FormMetaState = {
  videoUrl: string;
  videoTitle: string;
  content: string;
  bizDate: string;
  publishedAt: string;
  publishedAtText: string;
  anomalyStatus: AnomalyStatus;
  uploadedAt: string;
  topicTag: string;
  videoForm: string;
  contentKeywords: string[];
  punishType?: string;
  platformNotice?: string;
  appeal?: string;
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
  roleOverrides: SubmissionAssigneeRole[];
};

export type SlotViewState = SubmissionState["slots"][SubmissionSlotRole] & {
  fileName?: string;
  error?: string | null;
  assetUrl?: string | null;
  previewUrl?: string | null;
  file?: File | null;
  screenshotType?: "data" | "curve" | "retention" | null;
  recognizedFields?: Record<string, unknown> | null;
  ocrSummary?: string[];
  ocrFallback?: boolean;
};

export const VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER: ScreenshotUploadSlotRole[] = [
  "screenshot_1",
  "screenshot_2",
];

export function createInitialMeta(today: string, userId: string, bizDate = today): FormMetaState {
  const normalizedBizDate = /^\d{4}-\d{2}-\d{2}$/.test(bizDate) ? bizDate : today;
  const publishedAt = getDefaultPublishedAtForBizDate(normalizedBizDate, today);

  return {
    videoUrl: "",
    videoTitle: "",
    content: "",
    bizDate: normalizedBizDate,
    publishedAt,
    publishedAtText: "",
    anomalyStatus: "normal",
    uploadedAt: "",
    topicTag: "复盘",
    videoForm: "出镜",
    contentKeywords: [],
    platformNotice: "",
    appeal: "",
    scriptAuthorUserId: userId,
    videoEditorUserId: userId,
    operatorUserId: userId,
    roleOverrides: [],
  };
}

export type ConfidenceLevel = "high" | "medium" | "low";

export type EditableMetricField = SubmissionFieldState & {
  confidenceLevel?: ConfidenceLevel | null;
  /** 该字段最近一次 OCR 识别到的原始值，供「恢复识别值」使用；null 表示没有可恢复的原值。 */
  ocrValue?: string | null;
  /** 与 `ocrValue` 同时刻的识别置信度，恢复原值时要一起还原。 */
  ocrConfidenceLevel?: ConfidenceLevel | null;
  /** 用户是否在本表单里手打过这个字段；手打过的字段不被二次识别直接覆盖。 */
  manuallyEdited?: boolean;
};

export function createFieldState(value = ""): EditableMetricField {
  return {
    key: "play_count",
    value,
    source: "manual",
    requiresManualConfirmation: false,
    confirmed: true,
    confidenceScore: null,
    confidenceLevel: null,
    ocrValue: null,
    ocrConfidenceLevel: null,
    manuallyEdited: false,
  };
}

export function buildOcrSummary(
  screenshotType: "data" | "curve" | "retention" | null | undefined,
  recognizedFields: Record<string, unknown> | null | undefined,
): string[] {
  if (!recognizedFields) {
    return [];
  }

  // 曲线形态识别已下线：历史 curve 槽位不再展示分析结果
  if (screenshotType === "curve") {
    return [];
  }

  if (screenshotType === "retention") {
    const retentionMetrics = recognizedFields.retention_metrics as
      Record<string, number | null> | undefined;

    return [
      retentionMetrics?.avg_play_duration != null
        ? `均播时长：${retentionMetrics.avg_play_duration}秒`
        : null,
      retentionMetrics?.bounce_rate_2s != null
        ? `2秒跳出率：${retentionMetrics.bounce_rate_2s}%`
        : null,
      retentionMetrics?.completion_rate_5s != null
        ? `5秒完播率：${retentionMetrics.completion_rate_5s}%`
        : null,
      retentionMetrics?.completion_rate != null
        ? `整体完播率：${retentionMetrics.completion_rate}%`
        : null,
    ].filter((item): item is string => Boolean(item));
  }

  const baseSummary = Object.entries(recognizedFields)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        key !== "curve_info" &&
        key !== "retention_info",
    )
    .slice(0, 4)
    .map(([key, value]) => `${key}：${String(value)}`);

  return baseSummary;
}

export function createEditableFields(): Record<EditableMetricKey, EditableMetricField> {
  return {
    play_count: { ...createFieldState(), key: "play_count" },
    follower_gain: { ...createFieldState(), key: "follower_gain" },
    follower_convert: { ...createFieldState(), key: "follower_convert" },
    likes: { ...createFieldState(), key: "likes" },
    comments: { ...createFieldState(), key: "comments" },
    shares: { ...createFieldState(), key: "shares" },
    favorites: { ...createFieldState(), key: "favorites" },
    avg_play_duration: { ...createFieldState(), key: "avg_play_duration" },
    bounce_rate_2s: { ...createFieldState(), key: "bounce_rate_2s" },
    completion_rate_5s: { ...createFieldState(), key: "completion_rate_5s" },
    completion_rate: { ...createFieldState(), key: "completion_rate" },
  };
}

export function createEditableSlots(): Record<SubmissionSlotRole, SlotViewState> {
  const initial = createInitialSubmissionState().slots;
  return {
    screenshot_1: { ...initial.screenshot_1 },
    screenshot_2: { ...initial.screenshot_2 },
  };
}

export function createMetaFromEditDetail(
  detail: VideoSubmissionEditDetail,
  today: string,
  userId: string,
): FormMetaState {
  const refill = buildVideoSubmissionEditRefill(detail);
  const meta = refill.meta;
  const roleOverrides = ([
    ["script_author", meta.scriptAuthorUserId],
    ["video_editor", meta.videoEditorUserId],
    ["operator", meta.operatorUserId],
  ] as const).flatMap(([role, assignee]) =>
    assignee && assignee !== userId ? [role] : [],
  );

  return {
    ...createInitialMeta(today, userId),
    videoUrl: meta.videoUrl ?? "",
    videoTitle: meta.videoTitle ?? "",
    content: meta.content,
    bizDate: refill.bizDate,
    publishedAt: meta.publishedAt ?? "",
    publishedAtText: meta.publishedAtText ?? "",
    anomalyStatus: meta.anomalyStatus,
    uploadedAt: refill.uploadedAt ?? "",
    topicTag: meta.topicTag ?? "",
    videoForm: meta.videoForm ?? "",
    contentKeywords: [...meta.contentKeywords],
    punishType: meta.punishType ?? "",
    platformNotice: meta.platformNotice ?? "",
    appeal: meta.appeal ?? "",
    scriptAuthorUserId: meta.scriptAuthorUserId,
    videoEditorUserId: meta.videoEditorUserId,
    operatorUserId: meta.operatorUserId,
    roleOverrides,
  };
}

export function createEditableFieldsFromEditDetail(
  detail: VideoSubmissionEditDetail,
): Record<EditableMetricKey, EditableMetricField> {
  const refill = buildVideoSubmissionEditRefill(detail);
  const fields = createEditableFields();
  for (const [key, value] of Object.entries(refill.metrics) as Array<[EditableMetricKey, string]>) {
    fields[key] = {
      ...fields[key],
      value,
      source: "manual",
      confirmed: true,
      requiresManualConfirmation: false,
      confidenceLevel: null,
    };
  }
  return fields;
}

export function createEditableSlotsFromEditDetail(
  detail: VideoSubmissionEditDetail,
): Record<SubmissionSlotRole, SlotViewState> {
  const refill = buildVideoSubmissionEditRefill(detail);
  const slots = createEditableSlots();
  for (const role of VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER) {
    const asset = refill.assets[role];
    if (!asset) continue;
    slots[role] = {
      ...slots[role],
      status: asset.confirmed ? "confirmed" : "pending_confirm",
      confirmed: asset.confirmed,
      confidenceScore: asset.confidenceScore,
      assetUrl: asset.url,
      previewUrl: asset.url,
      file: null,
      fileName: "已保存截图",
      screenshotType: asset.screenshotType,
      recognizedFields: asset.recognizedFields,
      ocrSummary: buildOcrSummary(asset.screenshotType, asset.recognizedFields),
      ocrFallback: !asset.confirmed,
    };
  }
  return slots;
}
