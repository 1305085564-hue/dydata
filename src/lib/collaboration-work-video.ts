export type WorkVideoReport = {
  id: string;
  accountId: string;
  reportDate: string;
  videoId?: string | null;
  title?: string | null;
};

export type WorkVideoCandidate = {
  id: string;
  accountId: string;
  title?: string | null;
  publishedAt: string | null;
  uploadedAt: string | null;
};

export type WorkVideoMatch =
  | { kind: "found"; videoId: string }
  | { kind: "not_found" }
  | { kind: "ambiguous"; count: number };

export function getShanghaiBusinessDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function buildShanghaiBusinessDayWindow(reportDate: string) {
  const start = new Date(`${reportDate}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function normalizeMatchText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function matchWorkVideoByBusinessDate(input: {
  report: WorkVideoReport;
  videos: WorkVideoCandidate[];
}): WorkVideoMatch {
  const matched = input.videos.filter((video) => (
    video.accountId === input.report.accountId
    && (
      getShanghaiBusinessDate(video.publishedAt) === input.report.reportDate
      || getShanghaiBusinessDate(video.uploadedAt) === input.report.reportDate
    )
  ));

  const reportVideoId = normalizeMatchText(input.report.videoId);
  if (reportVideoId) {
    const directMatch = matched.find((video) => video.id === reportVideoId)
      ?? input.videos.find((video) => video.id === reportVideoId && video.accountId === input.report.accountId);
    return directMatch ? { kind: "found", videoId: directMatch.id } : { kind: "not_found" };
  }

  if (matched.length === 0) return { kind: "not_found" };
  if (matched.length > 1) {
    const reportTitle = normalizeMatchText(input.report.title);
    if (reportTitle) {
      const titleMatched = matched.filter((video) => normalizeMatchText(video.title) === reportTitle);
      if (titleMatched.length === 1) return { kind: "found", videoId: titleMatched[0].id };
      if (titleMatched.length > 1) return { kind: "ambiguous", count: titleMatched.length };
    }
    return { kind: "ambiguous", count: matched.length };
  }
  return { kind: "found", videoId: matched[0].id };
}
