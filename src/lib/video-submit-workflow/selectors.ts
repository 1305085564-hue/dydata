import { parseSubmissionScreenshotPath } from "@/lib/submission-screenshot-access";
import type { SubmissionSlotRole, SubmissionState } from "@/components/submission/提交状态机";
import type { SlotViewState } from "@/app/(app)/dashboard/video-submit-form-model";

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

