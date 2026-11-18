import type { ExemptionCategory } from "@/types";

export type PendingExemptionNoticeDate = {
  date: string;
  category: ExemptionCategory;
};

function formatDate(date: string) {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

function dateOrdinal(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function consecutiveDays(left: string, right: string) {
  return dateOrdinal(right) - dateOrdinal(left) === 86400000;
}

function groupConsecutiveDates(dates: string[]) {
  const groups: string[][] = [];
  for (const date of dates) {
    const current = groups.at(-1);
    if (current && consecutiveDays(current[current.length - 1], date)) current.push(date);
    else groups.push([date]);
  }
  return groups;
}

export function buildPendingExemptionNoticeCopy(items: readonly PendingExemptionNoticeDate[]) {
  const hasLeave = items.some((item) => item.category === "leave");
  const hasWaive = items.some((item) => item.category === "waive");
  const title = hasLeave && hasWaive
    ? "请假/免交审批中"
    : hasLeave
      ? "请假审批中"
      : "免交审批中";
  const dates = [...new Set(items.map((item) => item.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  const segments = groupConsecutiveDates(dates);
  const visibleSegments = segments.length > 4 ? segments.slice(0, 3) : segments;
  const dateParts = visibleSegments.map((segment) =>
    segment.length >= 3
      ? `${formatDate(segment[0])}–${formatDate(segment[segment.length - 1])}`
      : segment.map(formatDate).join("、"),
  );
  if (segments.length > 4) {
    const hiddenDays = segments.slice(3).reduce((count, segment) => count + segment.length, 0);
    dateParts.push(`等 ${hiddenDays} 天`);
  }

  return {
    title,
    description: dateParts.length ? `· ${dateParts.join("、")}` : "· 正在等待管理员审批",
  };
}
