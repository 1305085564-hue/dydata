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

export function shouldAutoBindNewTopic({
  urlLocked,
  isManuallySet,
  topicId,
}: {
  urlLocked: boolean;
  isManuallySet: boolean;
  topicId: string | null | undefined;
}) {
  if (urlLocked) return false;
  return !(isManuallySet && Boolean(topicId));
}

export function resolveDraftTopicId({
  urlLocked,
  currentTopicId,
  draftTopicId,
}: {
  urlLocked: boolean;
  currentTopicId: string | null | undefined;
  draftTopicId: string | null | undefined;
}) {
  return urlLocked ? (currentTopicId ?? null) : (draftTopicId ?? null);
}

export function resolveDraftManualTopicState({
  urlLocked,
  currentIsManuallySet,
  draftIsManuallySet,
  draftTopicId,
}: {
  urlLocked: boolean;
  currentIsManuallySet: boolean;
  draftIsManuallySet?: boolean;
  draftTopicId: string | null | undefined;
}) {
  if (urlLocked) return currentIsManuallySet;
  return draftIsManuallySet ?? Boolean(draftTopicId);
}

export function shouldAutoSelectSuggestedTopic({
  urlLocked,
  isManuallySet,
  currentTopicId,
}: {
  urlLocked: boolean;
  isManuallySet: boolean;
  currentTopicId: string | null | undefined;
}) {
  return !urlLocked && !isManuallySet && !currentTopicId;
}

export function sanitizeTopicSearchKeyword(value: string) {
  return value.replace(/[%(),"]/g, " ").replace(/\s+/g, " ").trim();
}
