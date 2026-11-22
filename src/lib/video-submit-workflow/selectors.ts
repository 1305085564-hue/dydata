import { parseSubmissionScreenshotPath } from "@/lib/submission-screenshot-access";
import type { SubmissionSlotRole, SubmissionState } from "@/components/submission/提交状态机";
import { createEditableSlots, type SlotViewState } from "@/lib/video-submit/domain/video-submit-form-model";
import type {
  SubmissionWorkflowState,
  VideoSubmitDraftData,
} from "./types";

/** 异步任务不能跨刷新续跑；保存与读取旧草稿必须采用同一恢复规则。 */
export function sanitizeDraftSlot(slot: SlotViewState): SlotViewState {
  if (slot.status === "uploading" || slot.status === "recognizing") {
    if (!slot.assetUrl) {
      return { ...createEditableSlots()[slot.role], file: null, previewUrl: null };
    }
    return {
      ...slot,
      status: "pending_confirm",
      requiresManualConfirmation: true,
      confirmed: false,
      ocrFallback: true,
      error: "上次识别未完成，可点击重新识别或手动填写",
      file: null,
      previewUrl: null,
      startedAt: undefined,
      phaseStartedAt: undefined,
      finishedAt: undefined,
      batchStartedAt: undefined,
    };
  }
  return { ...slot, file: null, previewUrl: null };
}

export function serializeVideoSubmitDraft(
  input: SubmissionWorkflowState,
): VideoSubmitDraftData {
  return {
    ...input,
    slots: {
      screenshot_1: sanitizeDraftSlot(input.slots.screenshot_1),
      screenshot_2: sanitizeDraftSlot(input.slots.screenshot_2),
    },
  };
}

export function buildSubmissionState(
  slots: Record<SubmissionSlotRole, SlotViewState>,
  fields: SubmissionState["fields"],
  submitted: boolean,
): SubmissionState {
  return { slots, fields, submitted };
}

export function buildSubmissionAssets(
  slots: Record<SubmissionSlotRole, SlotViewState>,
) {
  return (Object.keys(slots) as SubmissionSlotRole[])
    .map((role) => slots[role])
    .filter((slot) => slot.assetUrl && parseSubmissionScreenshotPath(slot.assetUrl))
    .map((slot) => ({
      role: slot.role,
      url: slot.assetUrl!,
      confirmed: slot.confirmed,
      confidence_score: slot.confidenceScore,
      recognized_fields: slot.recognizedFields ?? null,
      screenshot_type: slot.screenshotType ?? null,
    }));
}

export function didSubmissionScreenshotsRefresh(
  currentAssets: Array<Pick<ReturnType<typeof buildSubmissionAssets>[number], "role" | "url">>,
  originalAssets: Array<Pick<ReturnType<typeof buildSubmissionAssets>[number], "role" | "url">>,
) {
  if (!currentAssets.length) return false;
  const originalUrlByRole = new Map(originalAssets.map((asset) => [asset.role, asset.url]));
  return currentAssets.some((asset) => originalUrlByRole.get(asset.role) !== asset.url);
}

export function buildVideoSubmitPayload(input: {
  mode: string;
  videoId: string | null;
  accountId: string;
  bizDate: string;
  videoUrl: string | null;
  videoTitle: string | null;
  content: string | null;
  publishedAt: string | null;
  publishedAtText: string | null;
  publishedAtSource?: "ocr" | "manual" | null;
  ocrPublishedAt?: string | null;
  ocrPublishedAtText?: string | null;
  anomalyStatus: string;
  punishType: string | null;
  platformNotice: string | null;
  appeal: string | null;
  topicTag: string | null;
  videoForm: string | null;
  topicId: string | null;
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
  manualEdit: boolean;
  /** 本次是否更换了截图，供提交端判断截图证据是否刷新。 */
  screenshotsRefreshed: boolean;
  contentKeywords: string[];
  assets: ReturnType<typeof buildSubmissionAssets>;
  metrics: Record<string, number | null>;
}) {
  return {
    mode: input.mode,
    video_id: input.videoId,
    account_id: input.accountId,
    biz_date: input.bizDate,
    video_url: input.videoUrl,
    video_title: input.videoTitle,
    content: input.content,
    published_at: input.publishedAt,
    published_at_text: input.publishedAtText,
    published_at_source: input.publishedAtSource,
    ocr_published_at: input.ocrPublishedAt,
    ocr_published_at_text: input.ocrPublishedAtText,
    anomaly_status: input.anomalyStatus,
    punish_type: input.punishType,
    platform_notice: input.platformNotice,
    appeal: input.appeal,
    topic_tag: input.topicTag,
    video_form: input.videoForm,
    topic_id: input.topicId,
    script_author_user_id: input.scriptAuthorUserId,
    video_editor_user_id: input.videoEditorUserId,
    operator_user_id: input.operatorUserId,
    manual_edit: input.manualEdit,
    screenshots_refreshed: input.screenshotsRefreshed,
    content_keywords: input.contentKeywords,
    assets: input.assets,
    // 导粉话术并入文案（2026-10-27 产品决定）：不再单独收集、也不再提交话术字段，
    // “导粉文案”直接用日报的文案 + 导粉数表达，不需要额外表。
    metrics: input.metrics,
  };
}
