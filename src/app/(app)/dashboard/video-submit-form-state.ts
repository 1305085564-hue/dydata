import type { SubmitPanelMode } from "./video-submit-panel-state";
import type { AnomalyStatus } from "@/types";
import type { VideoSubmissionEditDetail } from "@/app/api/video-submit/edit-detail";
export { getDefaultPublishedAtForBizDate } from "@/lib/日报";

export type { VideoSubmissionEditDetail };

export const SUBMISSION_ASSIGNEE_ROLES = ["script_author", "video_editor", "operator"] as const;
export type SubmissionAssigneeRole = (typeof SUBMISSION_ASSIGNEE_ROLES)[number];

const SUBMISSION_ASSIGNEE_ROLE_LABELS: Record<SubmissionAssigneeRole, string> = {
  script_author: "文案",
  video_editor: "剪辑",
  operator: "运营",
};

export function getHiddenRoleRestoreLabel(
  hiddenRoles: ReadonlySet<SubmissionAssigneeRole>,
) {
  const hiddenRoleLabels = SUBMISSION_ASSIGNEE_ROLES
    .filter((role) => hiddenRoles.has(role))
    .map((role) => SUBMISSION_ASSIGNEE_ROLE_LABELS[role]);

  if (hiddenRoleLabels.length === 0) return null;
  if (hiddenRoleLabels.length === SUBMISSION_ASSIGNEE_ROLES.length) {
    return "+ 协同创作";
  }

  return `显示已隐藏岗位（${hiddenRoleLabels.join("、")}）`;
}

export type SubmissionRoleAssignments = {
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
};


function getAssignmentKey(role: SubmissionAssigneeRole): keyof SubmissionRoleAssignments {
  if (role === "script_author") return "scriptAuthorUserId";
  if (role === "video_editor") return "videoEditorUserId";
  return "operatorUserId";
}

export function addRoleOverride({
  userId,
  role,
  assignments,
  overrides,
}: {
  userId: string;
  role: SubmissionAssigneeRole;
  assignments: SubmissionRoleAssignments;
  overrides: SubmissionAssigneeRole[];
}) {
  if (!userId) return { assignments, overrides };
  return {
    assignments,
    overrides: overrides.includes(role) ? overrides : [...overrides, role],
  };
}

export function removeRoleOverride({
  userId,
  role,
  assignments,
  overrides,
}: {
  userId: string;
  role: SubmissionAssigneeRole;
  assignments: SubmissionRoleAssignments;
  overrides: SubmissionAssigneeRole[];
}) {
  return {
    assignments: { ...assignments, [getAssignmentKey(role)]: userId },
    overrides: overrides.filter((item) => item !== role),
  };
}

export function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function setOperatorToSelf(userId: string) {
  return userId;
}

export function setOperatorUser(id: string) {
  return id;
}

export function shouldAutoRedirectToGrowthAfterSubmit({
  mode,
  bizDate,
  today,
  submittedViewActive,
  hasInitialSummary,
}: {
  mode: SubmitPanelMode;
  bizDate: string;
  today: string;
  submittedViewActive: boolean;
  hasInitialSummary: boolean;
}) {
  return mode === "create" && bizDate === today && !submittedViewActive && !hasInitialSummary;
}

export function preserveBizDateWhenPublishedAtChanges(currentBizDate: string) {
  return currentBizDate;
}

export function resolveVideoSubmitMode({
  panelMode,
  anomalyStatus,
  videoId,
}: {
  panelMode: SubmitPanelMode;
  anomalyStatus: AnomalyStatus;
  videoId?: string | null;
}) {
  if (panelMode === "editToday" && videoId) return "edit";
  if (anomalyStatus === "abnormal") return "abnormal";
  return "create";
}

export function resolveVideoSubmitMetaFields({
  mode,
  anomalyStatus,
  publishedAt,
  punishType,
  platformNotice,
  appeal,
  defaultPublishedAt,
}: {
  mode: SubmitPanelMode;
  anomalyStatus: AnomalyStatus;
  publishedAt: string;
  punishType: string;
  platformNotice: string;
  appeal: string;
  defaultPublishedAt: string;
}) {
  const isEdit = mode === "editToday";
  const isAbnormal = anomalyStatus === "abnormal";

  return {
    publishedAt: isEdit
      ? normalizeOptionalText(publishedAt)
      : publishedAt || defaultPublishedAt,
    punishType: isAbnormal
      ? (isEdit ? normalizeOptionalText(punishType) : normalizeOptionalText(punishType) ?? "限流")
      : null,
    platformNotice: isAbnormal ? normalizeOptionalText(platformNotice) : null,
    appeal: isAbnormal ? normalizeOptionalText(appeal) : null,
  };
}

export type VideoSubmitEditPayloadLike = {
  video_id?: string | null;
  account_id?: string | null;
  biz_date?: string | null;
  metrics?: Record<string, unknown> | null;
  assignees?: {
    script_author_user_id?: string | null;
    video_editor_user_id?: string | null;
    operator_user_id?: string | null;
  } | null;
} | null;

export function getMissingEditPayloadFields(payload: VideoSubmitEditPayloadLike) {
  if (!payload) return ["video_id", "account_id", "biz_date", "metrics", "assignees"];

  const missing: string[] = [];
  if (!payload.video_id) missing.push("video_id");
  if (!payload.account_id) missing.push("account_id");
  if (!payload.biz_date) missing.push("biz_date");
  if (!payload.metrics) missing.push("metrics");
  const assignees = payload.assignees;
  if (
    !assignees?.script_author_user_id ||
    !assignees.video_editor_user_id ||
    !assignees.operator_user_id
  ) {
    missing.push("assignees");
  }
  return missing;
}

export type VideoSubmissionEditAsset = {
  role: ScreenshotUploadSlotRole;
  url: string;
  confirmed: boolean;
  confidenceScore: number | null;
  recognizedFields: Record<string, unknown> | null;
  screenshotType: "data" | "curve" | "retention" | null;
};

export type VideoSubmissionEditRefill = {
  videoId: string;
  accountId: string;
  bizDate: string;
  meta: VideoSubmissionEditDetail["meta"];
  metrics: Record<EditableMetricName, string>;
  assets: Record<ScreenshotUploadSlotRole, VideoSubmissionEditAsset | null>;
  conversionScript: VideoSubmissionEditDetail["conversionScript"];
  uploadedAt: string | null;
};

type EditableMetricName =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain"
  | "follower_loss"
  | "follower_convert"
  | "avg_play_duration"
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "completion_rate";

const EDIT_DETAIL_METRICS: Array<{
  apiKey: keyof VideoSubmissionEditDetail["metrics"];
  formKey: EditableMetricName;
  label: string;
}> = [
  { apiKey: "playCount", formKey: "play_count", label: "播放量" },
  { apiKey: "likes", formKey: "likes", label: "点赞" },
  { apiKey: "comments", formKey: "comments", label: "评论" },
  { apiKey: "shares", formKey: "shares", label: "分享" },
  { apiKey: "favorites", formKey: "favorites", label: "收藏" },
  { apiKey: "followerGain", formKey: "follower_gain", label: "涨粉" },
  { apiKey: "followerLoss", formKey: "follower_loss", label: "掉粉" },
  { apiKey: "followerConvert", formKey: "follower_convert", label: "导粉" },
  { apiKey: "avgPlayDuration", formKey: "avg_play_duration", label: "平均播放时长" },
  { apiKey: "bounceRate2s", formKey: "bounce_rate_2s", label: "2秒跳出率" },
  { apiKey: "completionRate5s", formKey: "completion_rate_5s", label: "5秒完播率" },
  { apiKey: "completionRate", formKey: "completion_rate", label: "完播率" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * Treat an edit read as untrusted until all state that could overwrite the
 * existing submission has been returned. The caller must not mount a savable
 * edit form while this returns an error.
 */
export function getVideoSubmissionEditDetailError(
  value: unknown,
  expected: { accountId: string; bizDate: string },
): string | null {
  if (!isRecord(value)) return "编辑详情格式错误，未读取到原视频记录";
  if (typeof value.videoId !== "string" || !value.videoId.trim()) {
    return "编辑详情缺少原视频 ID，不能安全保存";
  }
  if (value.accountId !== expected.accountId) {
    return "编辑详情与当前账号不一致，不能安全保存";
  }
  if (value.bizDate !== expected.bizDate) {
    return "编辑详情与当前日期不一致，不能安全保存";
  }

  const meta = value.meta;
  if (!isRecord(meta)) return "编辑详情缺少视频信息，不能安全保存";
  const nullableMetaKeys = [
    "videoUrl",
    "videoTitle",
    "publishedAt",
    "publishedAtText",
    "punishType",
    "platformNotice",
    "appeal",
    "topicTag",
    "videoForm",
    "scriptAuthorUserId",
    "videoEditorUserId",
    "operatorUserId",
  ];
  if (
    typeof meta.content !== "string" ||
    (meta.anomalyStatus !== "normal" && meta.anomalyStatus !== "abnormal") ||
    !Array.isArray(meta.contentKeywords) ||
    meta.contentKeywords.some((item) => typeof item !== "string") ||
    nullableMetaKeys.some((key) => !isNullableString(meta[key]))
  ) {
    return "编辑详情的视频信息不完整，不能安全保存";
  }

  const metrics = value.metrics;
  if (!isRecord(metrics)) return "编辑详情缺少24小时指标，不能安全保存";
  for (const metric of EDIT_DETAIL_METRICS) {
    if (typeof metrics[metric.apiKey] !== "number" || !Number.isFinite(metrics[metric.apiKey])) {
      return `编辑详情的${metric.label}不完整，不能安全保存`;
    }
  }

  if (!Array.isArray(value.assets)) return "编辑详情缺少截图信息，不能安全保存";
  const assetRoles = new Set<string>();
  for (const asset of value.assets) {
    if (!isRecord(asset)) return "编辑详情的截图信息不完整，不能安全保存";
    if (asset.role !== "screenshot_1" && asset.role !== "screenshot_2") {
      return "编辑详情包含无法识别的截图槽位，不能安全保存";
    }
    if (assetRoles.has(asset.role)) return "编辑详情的截图槽位冲突，不能安全保存";
    assetRoles.add(asset.role);
    if (
      typeof asset.url !== "string" ||
      !asset.url.trim() ||
      typeof asset.confirmed !== "boolean" ||
      (asset.confidenceScore !== null &&
        (typeof asset.confidenceScore !== "number" || !Number.isFinite(asset.confidenceScore))) ||
      (asset.recognizedFields !== null && !isRecord(asset.recognizedFields)) ||
      (asset.screenshotType !== null &&
        asset.screenshotType !== "data" &&
        asset.screenshotType !== "curve" &&
        asset.screenshotType !== "retention")
    ) {
      return "编辑详情的截图信息不完整，不能安全保存";
    }
  }
  if (meta.anomalyStatus === "normal" && (assetRoles.size !== 2 || !assetRoles.has("screenshot_1") || !assetRoles.has("screenshot_2"))) {
    return "原正常视频缺少互动截图或完播截图，不能安全保存";
  }

  const conversionScript = value.conversionScript;
  if (conversionScript !== null) {
    if (
      !isRecord(conversionScript) ||
      !isNullableString(conversionScript.text) ||
      !isNullableString(conversionScript.format)
    ) {
      return "编辑详情的导粉话术不完整，不能安全保存";
    }
  }
  const followerConvert = metrics.followerConvert;
  if (
    typeof followerConvert === "number" &&
    followerConvert > 0 &&
    (!isRecord(conversionScript) ||
      typeof conversionScript.text !== "string" ||
      !conversionScript.text.trim() ||
      typeof conversionScript.format !== "string" ||
      !conversionScript.format.trim())
  ) {
    return "原导粉数据缺少导粉话术，不能安全保存";
  }

  return null;
}

export function buildVideoSubmissionEditRefill(
  detail: VideoSubmissionEditDetail,
): VideoSubmissionEditRefill {
  const metrics = {} as Record<EditableMetricName, string>;
  for (const metric of EDIT_DETAIL_METRICS) {
    metrics[metric.formKey] = String(detail.metrics[metric.apiKey]);
  }

  const assets: Record<ScreenshotUploadSlotRole, VideoSubmissionEditAsset | null> = {
    screenshot_1: null,
    screenshot_2: null,
  };
  for (const asset of detail.assets) {
    assets[asset.role] = {
      ...asset,
      recognizedFields: asset.recognizedFields ? { ...asset.recognizedFields } : null,
    };
  }

  return {
    videoId: detail.videoId,
    accountId: detail.accountId,
    bizDate: detail.bizDate,
    meta: {
      ...detail.meta,
      contentKeywords: [...detail.meta.contentKeywords],
    },
    metrics,
    assets,
    conversionScript: detail.conversionScript
      ? { ...detail.conversionScript }
      : null,
    uploadedAt: detail.uploadedAt,
  };
}

export type ScreenshotUploadSlotRole = "screenshot_1" | "screenshot_2";
export type ScreenshotUploadSlotLike = { status: string };

export const SCREENSHOT_UPLOAD_SLOT_ORDER: ScreenshotUploadSlotRole[] = [
  "screenshot_1",
  "screenshot_2",
];

export function findNextScreenshotUploadRole(
  slots: Record<ScreenshotUploadSlotRole, ScreenshotUploadSlotLike>,
  order: ScreenshotUploadSlotRole[] = SCREENSHOT_UPLOAD_SLOT_ORDER,
): ScreenshotUploadSlotRole | null {
  return order.find((role) => {
    const status = slots[role]?.status;
    return status === "empty" || status === "failed";
  }) ?? null;
}

export type HistoricalAssigneeProfile = {
  userId: string;
  name?: string | null;
  displayName?: string | null;
  membershipStatus?: string | null;
};

export type ActiveAssigneeMemberLike = {
  id: string;
  name?: string | null;
  display_name?: string | null;
};

export type AssigneeDisplay = {
  text: string;
  external: boolean;
  historical: boolean;
};

/**
 * 历史责任人显示规则：
 * - 本人 → “（我）”标注；
 * - 在职候选列表命中 → 正常显示，可改选；
 * - 不在候选列表但有旧档案 → 显示旧姓名并标注“历史成员 · 不可选”；
 * - 完全找不到档案 → 显示“历史责任人”，绝不冒充当前用户。
 */
export function resolveAssigneeDisplay({
  assignedUserId,
  currentUserId,
  activeMembers,
  historicalProfiles = [],
  selfLabel = "我",
}: {
  assignedUserId: string | null | undefined;
  currentUserId: string;
  activeMembers: ActiveAssigneeMemberLike[];
  historicalProfiles?: HistoricalAssigneeProfile[];
  selfLabel?: string;
}): AssigneeDisplay {
  if (!assignedUserId || assignedUserId === currentUserId) {
    const currentMember = activeMembers.find((member) => member.id === currentUserId);
    const selfName = currentMember?.display_name || currentMember?.name || selfLabel;
    return { text: `${selfName} (我)`, external: false, historical: false };
  }

  const activeMember = activeMembers.find((member) => member.id === assignedUserId);
  if (activeMember) {
    return {
      text: activeMember.display_name || activeMember.name || "",
      external: true,
      historical: false,
    };
  }

  const profile = historicalProfiles.find((item) => item.userId === assignedUserId);
  const historicalName = profile?.displayName?.trim() || profile?.name?.trim();
  return {
    text: historicalName ? `${historicalName}（历史成员 · 不可选）` : "历史责任人（不可选）",
    external: true,
    historical: true,
  };
}
