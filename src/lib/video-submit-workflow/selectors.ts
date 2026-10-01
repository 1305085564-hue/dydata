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
