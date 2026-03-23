import type { EditableMetricKey, SubmissionFieldSource } from "./提交状态机";

export type EditableFieldState = {
  key: EditableMetricKey;
  value: string;
  source: SubmissionFieldSource;
  requiresManualConfirmation: boolean;
  confirmed: boolean;
  confidenceScore?: number | null;
};

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
  };
}

export type { EditableMetricKey };
