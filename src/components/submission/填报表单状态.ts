import type { EditableMetricKey, SubmissionFieldSource, SubmissionState, SubmissionIssueSummary } from "./提交状态机";
import { summarizeSubmissionIssues as summarizeBaseIssues } from "./提交状态机";

export type ConfidenceLevel = "high" | "medium" | "low";

export type EditableFieldState = {
  key: EditableMetricKey;
  value: string;
  source: SubmissionFieldSource;
  requiresManualConfirmation: boolean;
  confirmed: boolean;
  confidenceScore?: number | null;
  confidenceLevel?: ConfidenceLevel | null;
};

export type FirstInvalidFieldKey =
  | EditableMetricKey
  | "videoTitle"
  | "content"
  | "topicTag"
  | null;

export type ExtendedSubmissionIssueSummary = SubmissionIssueSummary & {
  firstInvalidFieldKey: FirstInvalidFieldKey;
};

export interface SubmissionIssueMetaInput {
  topicTag?: string;
  anomalyStatus?: string;
  videoTitle?: string;
  content?: string;
  contentKeywords?: string[];
}

export function summarizeSubmissionIssues(
  state: SubmissionState,
  meta: SubmissionIssueMetaInput = {}
): ExtendedSubmissionIssueSummary {
  const baseSummary = summarizeBaseIssues(state, meta);

  let firstInvalidFieldKey: FirstInvalidFieldKey = null;
  if (
    baseSummary.missingRequiredSlots.length > 0 ||
    baseSummary.processingRequiredSlots.length > 0 ||
    baseSummary.failedRequiredSlots.length > 0
  ) {
    firstInvalidFieldKey = null;
  } else if (baseSummary.missingRequiredMetrics.length > 0) {
    firstInvalidFieldKey = baseSummary.missingRequiredMetrics[0];
  } else if (baseSummary.missingRequiredMeta.length > 0) {
    firstInvalidFieldKey = baseSummary.missingRequiredMeta[0];
  } else if (baseSummary.topicTagMissing) {
    firstInvalidFieldKey = "topicTag";
  }

  return {
    ...baseSummary,
    firstInvalidFieldKey,
  };
}

export function isInteractionExceedingPlayCount(fields: {
  play_count: string | number | null;
  likes: string | number | null;
  comments: string | number | null;
  shares: string | number | null;
  favorites: string | number | null;
}): { exceeded: boolean; interactions: number; playCount: number } {
  const playCount = Number(fields.play_count || 0);
  const likes = Number(fields.likes || 0);
  const comments = Number(fields.comments || 0);
  const shares = Number(fields.shares || 0);
  const favorites = Number(fields.favorites || 0);
  const interactions = likes + comments + shares + favorites;
  const exceeded = playCount > 0 && interactions > playCount;
  return { exceeded, interactions, playCount };
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRecentBizDateRange(today: string): string[] {
  const [year, month, day] = today.split("-").map(Number);
  const current = new Date(year, (month || 1) - 1, day || 1);
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(current);
    next.setDate(current.getDate() - (6 - index));
    return formatDateKey(next);
  });
}

export function isBizDateSelectable(today: string, value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return value <= today;
}

export function getBizDateHelperText(value: string): string | null {
  if (!value) {
    return null;
  }

  const day = new Date(`${value}T00:00:00`).getDay();
  return day === 0 || day === 6 ? "周末内容，数据可在周一上传" : null;
}

export function formatHourText(value: string): string {
  if (!value) {
    return "";
  }

  const [, time = ""] = value.split("T");
  const [hourText = "", minuteText = ""] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return "";
  }

  if (minute === 0) {
    return `${hour}点`;
  }

  return `${hour}点${minute}分`;
}

export function syncPublishedAtAndText(args: {
  nextPublishedAt: string;
  nextPublishedAtText: string;
  changedField: "published_at" | "published_at_text";
}) {
  if (args.changedField === "published_at") {
    return {
      publishedAt: args.nextPublishedAt,
      publishedAtText: args.nextPublishedAtText.trim() || formatHourText(args.nextPublishedAt),
    };
  }

  return {
    publishedAt: args.nextPublishedAt,
    publishedAtText: args.nextPublishedAtText,
  };
}

export function toManualFieldState(field: EditableFieldState): EditableFieldState {
  return {
    ...field,
    source: "manual",
    requiresManualConfirmation: false,
    confirmed: true,
    confidenceLevel: null,
  };
}

export type { EditableMetricKey };
