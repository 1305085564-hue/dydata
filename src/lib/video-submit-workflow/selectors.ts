import { parseSubmissionScreenshotPath } from "@/lib/submission-screenshot-access";
import type { SubmissionSlotRole, SubmissionState, EditableMetricKey } from "@/components/submission/提交状态机";
import type { SlotViewState } from "@/app/(app)/dashboard/video-submit-form-model";
import type { EditableMetricField, FormMetaState } from "@/app/(app)/dashboard/video-submit-form-model";
import type { VideoSubmitDraftData } from "./types";

export function serializeVideoSubmitDraft(input: {
  meta: FormMetaState;
  fields: Record<EditableMetricKey, EditableMetricField>;
  slots: Record<SubmissionSlotRole, SlotViewState>;
  scriptText: string;
  keywordInput: string;
  hasManualScriptAuthorSelection?: boolean;
  hasManualOperatorSelection?: boolean;
  hasManualEdit?: boolean;
}): VideoSubmitDraftData {
  return {
    ...input,
    slots: {
      screenshot_1: { ...input.slots.screenshot_1, file: null, previewUrl: null },
      screenshot_2: { ...input.slots.screenshot_2, file: null, previewUrl: null },
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
  contentKeywords: string[];
  assets: ReturnType<typeof buildSubmissionAssets>;
  scriptText: string | null;
  scriptFormat: string | null;
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
    content_keywords: input.contentKeywords,
    assets: input.assets,
    script_text: input.scriptText,
    script_format: input.scriptFormat,
    metrics: input.metrics,
  };
}
