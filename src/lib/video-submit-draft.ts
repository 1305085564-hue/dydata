type DraftField = {
  value?: string | null;
};

type DraftSlot = {
  status?: string | null;
  fileName?: string | null;
  assetUrl?: string | null;
  previewUrl?: string | null;
  recognizedFields?: Record<string, unknown> | null;
  ocrSummary?: string[] | null;
};

type VideoSubmitDraft = {
  meta?: {
    videoUrl?: string | null;
    videoTitle?: string | null;
    content?: string | null;
    publishedAtText?: string | null;
    anomalyStatus?: string | null;
    topicTag?: string | null;
    contentKeywords?: string[] | null;
  } | null;
  fields?: Record<string, DraftField | undefined> | null;
  slots?: Record<string, DraftSlot | undefined> | null;
  scriptText?: string | null;
  keywordInput?: string | null;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasNonZeroMetric(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  const numeric = Number(trimmed);
  return !Number.isFinite(numeric) || numeric !== 0;
}

const EDITED_SLOT_STATUSES = new Set([
  "uploading",
  "recognizing",
  "pending_confirm",
  "confirmed",
  "failed",
]);

function hasEditedSlot(slot: DraftSlot | undefined) {
  if (!slot) return false;
  if (slot.status && EDITED_SLOT_STATUSES.has(slot.status)) return true;
  if (hasText(slot.fileName) || hasText(slot.assetUrl) || hasText(slot.previewUrl)) return true;
  if (slot.recognizedFields && Object.keys(slot.recognizedFields).length > 0) return true;
  if (slot.ocrSummary?.some(hasText)) return true;
  return false;
}

export function isVideoSubmitDraftEmpty(draft: VideoSubmitDraft) {
  const meta = draft.meta;
  const anomalyStatus = meta?.anomalyStatus?.trim();
  const topicTag = meta?.topicTag?.trim();

  if (
    hasText(meta?.videoUrl) ||
    hasText(meta?.videoTitle) ||
    hasText(meta?.content) ||
    hasText(meta?.publishedAtText) ||
    meta?.contentKeywords?.some(hasText)
  ) {
    return false;
  }

  if (anomalyStatus && anomalyStatus !== "正常") {
    return false;
  }

  if (topicTag && topicTag !== "复盘") {
    return false;
  }

  if (Object.values(draft.fields ?? {}).some((field) => hasNonZeroMetric(field?.value))) {
    return false;
  }

  if (Object.values(draft.slots ?? {}).some(hasEditedSlot)) {
    return false;
  }

  if (hasText(draft.scriptText) || hasText(draft.keywordInput)) {
    return false;
  }

  return true;
}
