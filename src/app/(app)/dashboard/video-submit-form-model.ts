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
  publishedAtSource?: "ocr" | "manual" | null;
  ocrPublishedAt?: string | null;
  ocrPublishedAtText?: string | null;
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
  itemId?: string;
  fileName?: string;
  error?: string | null;
  assetUrl?: string | null;
  previewUrl?: string | null;
  file?: File | null;
  startedAt?: number;
  phaseStartedAt?: number;
  finishedAt?: number;
  batchStartedAt?: number;
  screenshotType?: "data" | "curve" | "retention" | null;
  recognizedFields?: Record<string, unknown> | null;
  ocrSummary?: string[];
  ocrFallback?: boolean;
};

export type ScreenshotItemStatus = "uploading" | "recognizing" | "done" | "failed";

export type ScreenshotItem = {
  id: string;
  seq: number;
  file: File | null;
  status: ScreenshotItemStatus;
  /** 由放入的槽位决定（见 SCREENSHOT_TYPE_BY_SLOT），识别结果不改它。 */
  screenshotType: "data" | "retention";
  recognizedFields: Record<string, unknown> | null;
  assetUrl: string | null;
  previewUrl: string | null;
  bucket: string | null;
  path: string | null;
  storageRole: SubmissionSlotRole;
  fileName?: string;
  error?: string | null;
  confidenceScore?: number | null;
  requiresManualConfirmation: boolean;
  confirmed: boolean;
  ocrSummary?: string[];
  ocrFallback?: boolean;
  startedAt?: number;
  phaseStartedAt?: number;
  finishedAt?: number;
  batchStartedAt?: number;
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
    publishedAtSource: null,
    ocrPublishedAt: null,
    ocrPublishedAtText: null,
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

/**
 * OCR 摘要行的唯一标签来源。
 *
 * 摘要行格式固定为 `${METRIC_SUMMARY_LABELS[key]}：${值}`，生成端（本文件的
 * `buildOcrSummary`）与高亮端（`video-submit-form-v2` 的 `handleFieldFocus`）
 * 必须共用这一份，否则按措辞匹配的高亮会随文案漂移而失效。
 */
export const METRIC_SUMMARY_LABELS: Record<string, string> = {
  play_count: "播放量",
  follower_gain: "涨粉数",
  follower_convert: "导粉数",
  likes: "点赞数",
  comments: "评论数",
  shares: "分享数",
  favorites: "收藏数",
  avg_play_duration: "均播时长",
  avg_play_ratio: "平均播放占比",
  bounce_rate_2s: "2秒跳出率",
  completion_rate_5s: "5秒完播率",
  completion_rate: "整体完播率",
  video_title: "视频标题",
  published_at_text: "发布时间",
};

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
        ? `${METRIC_SUMMARY_LABELS.avg_play_duration}：${retentionMetrics.avg_play_duration}秒`
        : null,
      retentionMetrics?.avg_play_ratio != null
        ? `${METRIC_SUMMARY_LABELS.avg_play_ratio}：${retentionMetrics.avg_play_ratio}%`
        : null,
      retentionMetrics?.bounce_rate_2s != null
        ? `${METRIC_SUMMARY_LABELS.bounce_rate_2s}：${retentionMetrics.bounce_rate_2s}%`
        : null,
      retentionMetrics?.completion_rate_5s != null
        ? `${METRIC_SUMMARY_LABELS.completion_rate_5s}：${retentionMetrics.completion_rate_5s}%`
        : null,
      retentionMetrics?.completion_rate != null
        ? `${METRIC_SUMMARY_LABELS.completion_rate}：${retentionMetrics.completion_rate}%`
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
        key !== "retention_info" &&
        key !== "retention_metrics" &&
        key in METRIC_SUMMARY_LABELS,
    )
    .slice(0, 4)
    .map(([key, value]) => `${METRIC_SUMMARY_LABELS[key] ?? key}：${String(value)}`);

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
    avg_play_ratio: { ...createFieldState(), key: "avg_play_ratio" },
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
    publishedAtSource: null,
    ocrPublishedAt: null,
    ocrPublishedAtText: null,
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
      screenshotType: resolveEditScreenshotType(asset.screenshotType, role),
      recognizedFields: asset.recognizedFields,
      ocrSummary: buildOcrSummary(asset.screenshotType, asset.recognizedFields),
      ocrFallback: !asset.confirmed,
    };
  }
  return slots;
}

export function createScreenshotItemsFromEditDetail(
  detail: VideoSubmissionEditDetail,
): ScreenshotItem[] {
  const refill = buildVideoSubmissionEditRefill(detail);
  return VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER.flatMap((role, index) => {
    const asset = refill.assets[role];
    if (!asset) return [];
    const screenshotType = resolveEditScreenshotType(asset.screenshotType, role);
    return [{
      id: `legacy-${role}`,
      seq: index + 1,
      file: null,
      status: "done" as const,
      screenshotType,
      recognizedFields: asset.recognizedFields,
      assetUrl: asset.url,
      previewUrl: asset.url,
      bucket: null,
      path: null,
      storageRole: role,
      fileName: "已保存截图",
      confidenceScore: asset.confidenceScore,
      requiresManualConfirmation: !asset.confirmed,
      confirmed: asset.confirmed,
      ocrSummary: buildOcrSummary(screenshotType, asset.recognizedFields),
      ocrFallback: !asset.confirmed,
    }];
  });
}

function resolveEditScreenshotType(
  screenshotType: VideoSubmissionEditDetail["assets"][number]["screenshotType"],
  role: SubmissionSlotRole,
): "data" | "retention" {
  if (screenshotType === "data" || screenshotType === "retention") return screenshotType;
  return role === "screenshot_2" ? "retention" : "data";
}

function slotFromScreenshotItem(item: ScreenshotItem, role: SubmissionSlotRole): SlotViewState {
  const hasAsset = Boolean(item.assetUrl || item.previewUrl);
  const status = item.status === "failed" && hasAsset
    ? "pending_confirm"
    : item.status === "done"
      ? item.requiresManualConfirmation ? "pending_confirm" : "confirmed"
      : item.status;
  return {
    role,
    required: true,
    status,
    confidenceScore: item.confidenceScore ?? null,
    requiresManualConfirmation: item.requiresManualConfirmation,
    confirmed: item.confirmed,
    itemId: item.id,
    fileName: item.fileName,
    error: item.error ?? null,
    assetUrl: item.assetUrl,
    previewUrl: item.previewUrl,
    file: item.file,
    startedAt: item.startedAt,
    phaseStartedAt: item.phaseStartedAt,
    finishedAt: item.finishedAt,
    batchStartedAt: item.batchStartedAt,
    screenshotType: item.screenshotType,
    recognizedFields: item.recognizedFields,
    ocrSummary: item.ocrSummary,
    ocrFallback: item.ocrFallback,
  };
}

/** 类型判定的唯一来源：槽位。互动槽恒为 data，留存槽恒为 retention，不看识别结果。 */
export const SCREENSHOT_TYPE_BY_SLOT: Record<SubmissionSlotRole, "data" | "retention"> = {
  screenshot_1: "data",
  screenshot_2: "retention",
};

/** 每个槽位只展示放进这个槽位的最新一张；图不会因为识别结果在槽位间搬运。 */
export function deriveSlotsFromItems(
  items: readonly ScreenshotItem[],
): Record<SubmissionSlotRole, SlotViewState> {
  const slots = createEditableSlots();
  for (const role of VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER) {
    const current = items
      .filter((item) => item.storageRole === role)
      .sort((a, b) => b.seq - a.seq)[0];
    if (current) slots[role] = slotFromScreenshotItem(current, role);
  }
  return slots;
}

/**
 * 一批新图（粘贴 / 拖入 / 多选）按列表顺序填空槽：先互动、后留存。
 * 放不下的不收，返回张数交给调用方明确提示，不悄悄顶掉已有的图。
 */
export function allocateScreenshotSlots(
  items: readonly ScreenshotItem[],
  fileCount: number,
): { roles: SubmissionSlotRole[]; overflow: number } {
  const occupied = new Set(items.map((item) => item.storageRole));
  const free = VISIBLE_SCREENSHOT_UPLOAD_SLOT_ORDER.filter((role) => !occupied.has(role));
  const roles = free.slice(0, Math.max(0, fileCount));
  return { roles, overflow: Math.max(0, fileCount - roles.length) };
}
