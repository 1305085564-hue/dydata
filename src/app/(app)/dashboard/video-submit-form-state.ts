import type { SubmitPanelMode } from "./video-submit-panel-state";

export function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
