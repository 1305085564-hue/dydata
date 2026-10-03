import type { SubmitPanelRequestedMode } from "@/lib/dashboard-submission-state";

export function resolvePanelRequestedMode(
  activeBizDate: string,
  today: string,
  requestedMode: SubmitPanelRequestedMode,
): SubmitPanelRequestedMode {
  return requestedMode ?? (activeBizDate === today ? null : "backfill");
}

export function resolvePanelDateSelection(
  date: string,
  today: string,
  hasActivityData: boolean,
  hasActivityError: boolean,
) {
  return {
    requestedMode: null as SubmitPanelRequestedMode,
    submittedViewActive: false,
    shouldLoadActivity: date < today && !hasActivityData && !hasActivityError,
  };
}

export function resolvePanelSubmittedState() {
  return { submittedViewActive: true, requestedMode: null as SubmitPanelRequestedMode };
}
