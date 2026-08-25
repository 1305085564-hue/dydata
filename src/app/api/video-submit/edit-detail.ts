import { SCRIPT_FORMATS, type ScriptFormat } from "@/lib/conversion-hub/types";
import type { SubmissionAssetMeta } from "@/types";
import { parseSubmissionScreenshotPath } from "@/lib/submission-screenshot-access";
import { isUuidLike } from "./stability";
import type { VideoSubmitValidationMetrics } from "./validation";

const EDIT_REQUIRED_FIELDS = [
  "mode",
  "video_id",
  "account_id",
  "biz_date",
  "video_url",
  "video_title",
  "content",
  "published_at",
  "published_at_text",
  "anomaly_status",
  "punish_type",
  "platform_notice",
  "appeal",
  "topic_tag",
  "video_form",
  "content_keywords",
  "script_author_user_id",
  "video_editor_user_id",
  "operator_user_id",
  "assets",
  "script_text",
  "script_format",
  "metrics",
] as const;

const METRIC_FIELDS = [
  "play_count",
  "likes",
  "comments",
  "shares",
  "favorites",
  "follower_gain",
  "follower_loss",
  "follower_convert",
  "avg_play_duration",
  "bounce_rate_2s",
  "completion_rate_5s",
  "completion_rate",
] as const;

type UnknownRecord = Record<string, unknown>;

export interface EditSubmissionContract {
  video_id: string;
  video: {
    account_id: string;
    video_url: string | null;
    video_title: string | null;
    content: string | null;
    published_at: string | null;
    anomaly_status: string;
    punish_type: string | null;
    platform_notice: string | null;
    appeal: string | null;
    topic_id: string | null | undefined;
  };
  snapshot24h: {
    snapshot_type: "24h";
    metrics: VideoSubmitValidationMetrics;
    assets: SubmissionAssetMeta[];
  };
  dailyReport: {
    account_id: string;
    report_date: string;
    title: string | null;
    content: string | null;
    published_at: string | null;
    metrics: VideoSubmitValidationMetrics;
  };
  manualTags: {
    topic_tag: string | null;
    video_form: string | null;
    content_keywords: string[];
  };
  assignees: {
    script_author_user_id: string | null;
    video_editor_user_id: string | null;
    operator_user_id: string | null;
  };
  usageRecord: {
    script_text: string | null;
    script_format: ScriptFormat | null;
    follower_convert: number;
  };
}

export type EditSubmissionContractResult =
  | { ok: true; dto: EditSubmissionContract }
  | { ok: false; error: string };

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isUuidLike(value));
}

function isSubmissionAsset(value: unknown): value is SubmissionAssetMeta {
  if (!isRecord(value)) return false;
  return (
    (value.role === "screenshot_1" || value.role === "screenshot_2") &&
    typeof value.url === "string" &&
    typeof value.confirmed === "boolean"
  );
}

export function buildEditSubmissionContract(payload: unknown): EditSubmissionContractResult {
  if (!isRecord(payload)) {
    return { ok: false, error: "编辑提交缺少完整字段：mode" };
  }

  if (payload.mode !== undefined && payload.mode !== null && payload.mode !== "" && payload.mode !== "edit") {
    return { ok: false, error: "编辑提交 mode 必须是 edit" };
  }

  const missingFields = EDIT_REQUIRED_FIELDS.filter((field) => field !== "mode" && !hasOwn(payload, field));
  if (missingFields.length) {
    return { ok: false, error: `编辑提交缺少完整字段：${missingFields.join("、")}` };
  }

  if (typeof payload.video_id !== "string" || !isUuidLike(payload.video_id)) {
    return { ok: false, error: "编辑提交必须携带合法 video_id" };
  }

  if (typeof payload.account_id !== "string" || !payload.account_id.trim()) {
    return { ok: false, error: "编辑提交的 account_id 格式不正确" };
  }
  if (typeof payload.biz_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.biz_date)) {
    return { ok: false, error: "编辑提交的业务日期格式不正确" };
  }

  const nullableFields = [
    "video_url",
    "video_title",
    "content",
    "published_at",
    "published_at_text",
    "punish_type",
    "platform_notice",
    "appeal",
    "topic_tag",
    "video_form",
    "script_text",
  ] as const;
  const invalidNullableField = nullableFields.find((field) => !isNullableString(payload[field]));
  if (invalidNullableField) {
    return { ok: false, error: `编辑提交的 ${invalidNullableField} 格式不正确` };
  }
  if (hasOwn(payload, "topic_id") && !isNullableString(payload.topic_id)) {
    return { ok: false, error: "编辑提交的 topic_id 格式不正确" };
  }
  if (typeof payload.anomaly_status !== "string" || !payload.anomaly_status.trim()) {
    return { ok: false, error: "编辑提交的 anomaly_status 格式不正确" };
  }

  const assigneeFields = [
    "script_author_user_id",
    "video_editor_user_id",
    "operator_user_id",
  ] as const;
  if (assigneeFields.some((field) => !isNullableUuid(payload[field]))) {
    return { ok: false, error: "编辑提交必须携带三岗位责任人的合法 UUID" };
  }

  if (!Array.isArray(payload.content_keywords)) {
    return { ok: false, error: "编辑提交的手工标签格式不正确" };
  }
  if (payload.content_keywords.some((item) => typeof item !== "string")) {
    return { ok: false, error: "编辑提交的手工标签格式不正确" };
  }
  if (!Array.isArray(payload.assets)) {
    return { ok: false, error: "编辑提交的截图资产格式不正确" };
  }
  if (payload.assets.some((asset) => !isSubmissionAsset(asset))) {
    return { ok: false, error: "编辑提交的截图资产格式不正确" };
  }
  if (!isRecord(payload.metrics)) {
    return { ok: false, error: "编辑提交缺少 24h 指标" };
  }

  const missingMetric = METRIC_FIELDS.find((field) => !hasOwn(payload.metrics as UnknownRecord, field));
  if (missingMetric) {
    return { ok: false, error: `编辑提交缺少 24h 指标：${missingMetric}` };
  }
  const invalidMetric = METRIC_FIELDS.find((field) => {
    const value = (payload.metrics as UnknownRecord)[field];
    return typeof value !== "number" || !Number.isFinite(value);
  });
  if (invalidMetric) {
    return { ok: false, error: `编辑提交的 24h 指标格式不正确：${invalidMetric}` };
  }

  const scriptFormat = payload.script_format === null
    ? null
    : SCRIPT_FORMATS.includes(payload.script_format as ScriptFormat)
      ? payload.script_format as ScriptFormat
      : null;
  if (payload.script_format !== null && !scriptFormat) {
    return { ok: false, error: "编辑提交的导粉话术格式不正确" };
  }
  if (typeof payload.script_text === "string" && payload.script_text.trim() && !scriptFormat) {
    return { ok: false, error: "编辑提交的导粉话术格式不正确" };
  }

  const metrics = payload.metrics as unknown as VideoSubmitValidationMetrics;
  const dto: EditSubmissionContract = {
    video_id: payload.video_id.trim(),
    video: {
      account_id: String(payload.account_id),
      video_url: nullableString(payload.video_url),
      video_title: nullableString(payload.video_title),
      content: nullableString(payload.content),
      published_at: nullableString(payload.published_at),
      anomaly_status: String(payload.anomaly_status),
      punish_type: nullableString(payload.punish_type),
      platform_notice: nullableString(payload.platform_notice),
      appeal: nullableString(payload.appeal),
      topic_id: hasOwn(payload, "topic_id") ? nullableString(payload.topic_id) : undefined,
    },
    snapshot24h: {
      snapshot_type: "24h",
      metrics,
      assets: payload.assets as SubmissionAssetMeta[],
    },
    dailyReport: {
      account_id: String(payload.account_id),
      report_date: String(payload.biz_date),
      title: nullableString(payload.video_title),
      content: nullableString(payload.content),
      published_at: nullableString(payload.published_at),
      metrics,
    },
    manualTags: {
      topic_tag: nullableString(payload.topic_tag),
      video_form: nullableString(payload.video_form),
      content_keywords: payload.content_keywords.filter((item): item is string => typeof item === "string"),
    },
    assignees: {
      script_author_user_id: payload.script_author_user_id as string | null,
      video_editor_user_id: payload.video_editor_user_id as string | null,
      operator_user_id: payload.operator_user_id as string | null,
    },
    usageRecord: {
      script_text: nullableString(payload.script_text),
      script_format: scriptFormat,
      follower_convert: metrics.follower_convert,
    },
  };

  return { ok: true, dto };
}

export interface VideoSubmissionEditDetail {
  videoId: string;
  accountId: string;
  bizDate: string;
  meta: {
    videoUrl: string | null;
    videoTitle: string | null;
    content: string;
    publishedAt: string | null;
    publishedAtText: string | null;
    anomalyStatus: "normal" | "abnormal";
    punishType: string | null;
    platformNotice: string | null;
    appeal: string | null;
    topicTag: string | null;
    videoForm: string | null;
    contentKeywords: string[];
    scriptAuthorUserId: string | null;
    videoEditorUserId: string | null;
    operatorUserId: string | null;
  };
  metrics: {
    playCount: number;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
    followerGain: number;
    followerLoss: number;
    followerConvert: number;
    avgPlayDuration: number;
    bounceRate2s: number;
    completionRate5s: number;
    completionRate: number;
  };
  assets: Array<{
    role: "screenshot_1" | "screenshot_2";
    url: string;
    confirmed: boolean;
    confidenceScore: number | null;
    recognizedFields: Record<string, unknown> | null;
    screenshotType: "data" | "curve" | "retention" | null;
  }>;
  assigneeProfiles?: Array<{
    userId: string;
    name: string | null;
    displayName: string | null;
    membershipStatus: string | null;
  }>;
  conversionScript: { text: string | null; format: string | null } | null;
  uploadedAt: string | null;
}

export interface VideoSubmissionEditDetailSource {
  video: {
    id: string;
    account_id: string;
    video_url: string | null;
    video_title: string | null;
    content: string | null;
    published_at: string | null;
    uploaded_at: string | null;
    anomaly_status: string | null;
    punish_type: string | null;
    platform_notice: string | null;
    appeal: string | null;
    script_author_user_id: string | null;
    video_editor_user_id: string | null;
    operator_user_id: string | null;
  };
  snapshot: {
    id: string;
    video_id: string;
    snapshot_type: string;
    play_count: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
    follower_gain: number | null;
    follower_loss: number | null;
    follower_convert: number | null;
    avg_play_duration: number | null;
    bounce_rate_2s: number | null;
    completion_rate_5s: number | null;
    completion_rate: number | null;
    screenshot_urls: string[] | null;
    curve_screenshot_url: string | null;
    retention_screenshot_url: string | null;
    vs_previous: Record<string, unknown> | null;
  };
  dailyReport: { id: string; user_id: string; account_id: string; report_date: string };
  tags: Array<{ tag_dimension: string | null; tag_value: string | null }>;
  usageRecord: { id: string; script_text: string | null; script_format: string | null } | null;
  assigneeProfiles?: unknown;
  bizDate: string;
}

export type VideoSubmissionEditDetailResult =
  | { ok: true; detail: VideoSubmissionEditDetail }
  | { ok: false; error: string };

const EDIT_METRIC_FIELDS = [
  ["play_count", "playCount"],
  ["likes", "likes"],
  ["comments", "comments"],
  ["shares", "shares"],
  ["favorites", "favorites"],
  ["follower_gain", "followerGain"],
  ["follower_loss", "followerLoss"],
  ["follower_convert", "followerConvert"],
  ["avg_play_duration", "avgPlayDuration"],
  ["bounce_rate_2s", "bounceRate2s"],
  ["completion_rate_5s", "completionRate5s"],
  ["completion_rate", "completionRate"],
] as const;

function normalizeEditAnomalyStatus(value: string | null) {  if (value === "normal" || value === "正常") return "normal" as const;
  if (["abnormal", "异常", "删稿", "限流", "投流", "活动干预", "未满24h"].includes(value ?? "")) {
    return "abnormal" as const;
  }
  return null;
}

function pickSingleManualTag(
  tags: VideoSubmissionEditDetailSource["tags"],
  dimension: "话题" | "表达形式",
): { ok: true; value: string | null } | { ok: false; error: string } {
  const matching = tags.filter((tag) => tag.tag_dimension === dimension);
  if (matching.some((tag) => typeof tag.tag_value !== "string" || !tag.tag_value.trim())) {
    return { ok: false, error: `编辑详情不完整：${dimension}标签格式错误` };
  }
  const values = [...new Set(matching.map((tag) => tag.tag_value as string))];
  if (values.length > 1) return { ok: false, error: `编辑详情冲突：存在多个${dimension}标签` };
  return { ok: true, value: values[0] ?? null };
}

function buildEditAssets(
  snapshot: VideoSubmissionEditDetailSource["snapshot"],
  anomalyStatus: VideoSubmissionEditDetail["meta"]["anomalyStatus"],
): { ok: true; assets: VideoSubmissionEditDetail["assets"]; publishedAtText: string | null }
  | { ok: false; error: string } {
  const urls = snapshot.screenshot_urls;
  if (!urls) {
    if (anomalyStatus === "normal") return { ok: false, error: "编辑详情不完整：缺少已存截图" };
    return { ok: true, assets: [], publishedAtText: null };
  }
  if (urls.length !== 2 || urls.some((url) => typeof url !== "string" || !url.trim())) {
    return { ok: false, error: "编辑详情不完整：截图槽位不完整" };
  }

  const previous = snapshot.vs_previous;
  const rawOcrAssets = previous?.ocr_assets;
  if (!Array.isArray(rawOcrAssets)) return { ok: false, error: "编辑详情不完整：缺少截图 OCR 详情" };

  const ocrByRole = new Map<"screenshot_1" | "screenshot_2", UnknownRecord>();
  for (const item of rawOcrAssets) {
    if (!isRecord(item) || (item.role !== "screenshot_1" && item.role !== "screenshot_2")) {
      return { ok: false, error: "编辑详情不完整：截图 OCR 详情格式错误" };
    }
    if (ocrByRole.has(item.role)) return { ok: false, error: "编辑详情冲突：截图 OCR 槽位重复" };
    ocrByRole.set(item.role, item);
  }

  const assets = (["screenshot_1", "screenshot_2"] as const).map((role, index) => {
    const ocr = ocrByRole.get(role);
    if (!ocr || typeof ocr.confirmed !== "boolean") return null;
    const confidenceScore = ocr.confidence_score;
    const recognizedFields = ocr.recognized_fields;
    const screenshotType = ocr.screenshot_type;
    if (confidenceScore !== null && confidenceScore !== undefined && (typeof confidenceScore !== "number" || !Number.isFinite(confidenceScore))) return null;
    if (recognizedFields !== null && recognizedFields !== undefined && !isRecord(recognizedFields)) return null;
    if (screenshotType !== null && screenshotType !== undefined && screenshotType !== "data" && screenshotType !== "curve" && screenshotType !== "retention") return null;
    return {
      role,
      url: urls[index],
      confirmed: ocr.confirmed,
      confidenceScore: typeof confidenceScore === "number" ? confidenceScore : null,
      recognizedFields: isRecord(recognizedFields) ? recognizedFields : null,
      screenshotType: typeof screenshotType === "string" ? screenshotType : null,
    };
  });
  if (assets.some((asset) => asset === null)) return { ok: false, error: "编辑详情不完整：截图 OCR 详情格式错误" };

  const publishedAtText = previous?.published_at_text;
  if (publishedAtText !== undefined && publishedAtText !== null && typeof publishedAtText !== "string") {
    return { ok: false, error: "编辑详情不完整：发布时间文本格式错误" };
  }
  return { ok: true, assets: assets as VideoSubmissionEditDetail["assets"], publishedAtText: publishedAtText ?? null };
}

type EditDetailAssigneeProfile = NonNullable<VideoSubmissionEditDetail["assigneeProfiles"]>[number];

function normalizeAssigneeProfiles(value: unknown): EditDetailAssigneeProfile[] {
  if (!Array.isArray(value)) return [];
  const byUserId = new Map<string, EditDetailAssigneeProfile>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.userId !== "string" || !item.userId.trim()) continue;
    if (byUserId.has(item.userId)) continue;
    const name = typeof item.name === "string" ? item.name : null;
    const displayName = typeof item.displayName === "string" ? item.displayName : null;
    const membershipStatus = typeof item.membershipStatus === "string" ? item.membershipStatus : null;
    byUserId.set(item.userId, { userId: item.userId, name, displayName, membershipStatus });
  }
  return [...byUserId.values()];
}

export function buildVideoSubmissionEditDetail(
  source: VideoSubmissionEditDetailSource,
): VideoSubmissionEditDetailResult {
  if (source.snapshot.video_id !== source.video.id || source.snapshot.snapshot_type !== "24h") {
    return { ok: false, error: "编辑详情冲突：视频与24h快照不匹配" };
  }
  if (source.dailyReport.account_id !== source.video.account_id || source.dailyReport.report_date !== source.bizDate) {
    return { ok: false, error: "编辑详情冲突：视频与日报不匹配" };
  }
  if (typeof source.video.content !== "string") return { ok: false, error: "编辑详情不完整：视频文案缺失" };
  const anomalyStatus = normalizeEditAnomalyStatus(source.video.anomaly_status);
  if (!anomalyStatus) return { ok: false, error: "编辑详情不完整：视频状态错误" };

  const metricValues: Record<string, number> = {};
  for (const [sourceKey, targetKey] of EDIT_METRIC_FIELDS) {
    const value = source.snapshot[sourceKey];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: `编辑详情不完整：24h 指标 ${sourceKey} 缺失` };
    }
    metricValues[targetKey] = value;
  }

  const assetsResult = buildEditAssets(source.snapshot, anomalyStatus);
  if (!assetsResult.ok) return assetsResult;
  const topicTag = pickSingleManualTag(source.tags, "话题");
  if (!topicTag.ok) return topicTag;
  const videoForm = pickSingleManualTag(source.tags, "表达形式");
  if (!videoForm.ok) return videoForm;
  const keywords = source.tags.filter((tag) => tag.tag_dimension === "关键词");
  if (keywords.some((tag) => typeof tag.tag_value !== "string" || !tag.tag_value.trim())) {
    return { ok: false, error: "编辑详情不完整：关键词标签格式错误" };
  }
  const contentKeywords = [...new Set(keywords.map((tag) => tag.tag_value as string))];

  return {
    ok: true,
    detail: {
      videoId: source.video.id,
      accountId: source.video.account_id,
      bizDate: source.bizDate,
      meta: {
        videoUrl: source.video.video_url,
        videoTitle: source.video.video_title,
        content: source.video.content,
        publishedAt: source.video.published_at,
        publishedAtText: assetsResult.publishedAtText,
        anomalyStatus,
        punishType: source.video.punish_type,
        platformNotice: source.video.platform_notice,
        appeal: source.video.appeal,
        topicTag: topicTag.value,
        videoForm: videoForm.value,
        contentKeywords,
        scriptAuthorUserId: source.video.script_author_user_id,
        videoEditorUserId: source.video.video_editor_user_id,
        operatorUserId: source.video.operator_user_id,
      },
      metrics: {
        playCount: metricValues.playCount,
        likes: metricValues.likes,
        comments: metricValues.comments,
        shares: metricValues.shares,
        favorites: metricValues.favorites,
        followerGain: metricValues.followerGain,
        followerLoss: metricValues.followerLoss,
        followerConvert: metricValues.followerConvert,
        avgPlayDuration: metricValues.avgPlayDuration,
        bounceRate2s: metricValues.bounceRate2s,
        completionRate5s: metricValues.completionRate5s,
        completionRate: metricValues.completionRate,
      },
      assets: assetsResult.assets,
      assigneeProfiles: normalizeAssigneeProfiles(source.assigneeProfiles),
      conversionScript: source.usageRecord
        ? { text: source.usageRecord.script_text, format: source.usageRecord.script_format }
        : null,
      uploadedAt: source.video.uploaded_at,
    },
  };
}

export interface ExistingSubmissionScreenshotFields {
  screenshot_urls: string[] | null;
  curve_screenshot_url: string | null;
  retention_screenshot_url: string | null;
  vs_previous: Record<string, unknown> | null;
}

export function mergeReusableScreenshotFields(
  mode: string,
  requestedAssets: SubmissionAssetMeta[],
  existing: ExistingSubmissionScreenshotFields | null,
) {
  if (mode === "edit" && requestedAssets.length === 0 && existing) {
    return {
      screenshot_urls: existing.screenshot_urls,
      curve_screenshot_url: existing.curve_screenshot_url,
      retention_screenshot_url: existing.retention_screenshot_url,
      vs_previous: existing.vs_previous,
    };
  }

  return null;
}

/**
 * The V2 editor has no topic selector. During an edit, its absent topic_id
 * means "leave the existing video association unchanged", not "unlink it".
 */
export function resolveEditTopicId(
  mode: string,
  requestedTopicId: string | null,
  existingTopicId: string | null,
) {
  return mode === "edit" && requestedTopicId === null
    ? existingTopicId
    : requestedTopicId;
}

export function getExistingScreenshotUrls(existing: ExistingSubmissionScreenshotFields | null) {
  if (!existing) return [];
  return [
    ...(existing.screenshot_urls ?? []),
    existing.curve_screenshot_url,
    existing.retention_screenshot_url,
  ].filter((url): url is string => typeof url === "string" && Boolean(url.trim()));
}

export function hasReusableConfirmedScreenshots(existing: ExistingSubmissionScreenshotFields | null) {
  if (!existing) return false;

  const urls = existing.screenshot_urls;
  if (!Array.isArray(urls) || urls.length !== 2) return false;
  for (const url of urls) {
    if (typeof url !== "string" || !parseSubmissionScreenshotPath(url.trim())) return false;
  }

  const previous = existing.vs_previous;
  const ocrAssets =
    previous && typeof previous === "object" && !Array.isArray(previous) && Array.isArray(previous.ocr_assets)
      ? previous.ocr_assets
      : null;
  if (!ocrAssets) return false;

  const roles = new Set<string>();
  for (const asset of ocrAssets) {
    if (!isRecord(asset)) return false;
    if (asset.role !== "screenshot_1" && asset.role !== "screenshot_2") return false;
    if (roles.has(asset.role)) return false;
    roles.add(asset.role);
    if (asset.confirmed !== true) return false;
  }
  return roles.size === 2;
}
