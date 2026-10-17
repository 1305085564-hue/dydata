import type { DouyinUserMetricRow } from "./contracts";

export type DouyinExistingVideo = {
  id: string;
  accountId: string;
  douyinItemId: string | null;
  title: string | null;
  publishedAt: string | null;
};

export type DouyinVideoMatch = {
  status: "matched" | "pending_review" | "discovered";
  videoId: string | null;
  candidateVideoIds: string[];
};

export function classifyDouyinVideoMatch(input: {
  accountId: string;
  platformVideoId: string;
  title: string | null;
  platformPublishedAt: string | null;
  existingVideos: DouyinExistingVideo[];
}): DouyinVideoMatch {
  const sameAccount = input.existingVideos.filter((video) => video.accountId === input.accountId);
  const exact = sameAccount.find((video) => video.douyinItemId === input.platformVideoId);
  if (exact) return { status: "matched", videoId: exact.id, candidateVideoIds: [exact.id] };

  const candidates = sameAccount
    .filter((video) => isWithin72Hours(video.publishedAt, input.platformPublishedAt) || normalizedTitle(video.title) === normalizedTitle(input.title))
    .map((video) => video.id);
  return candidates.length > 0
    ? { status: "pending_review", videoId: null, candidateVideoIds: candidates }
    : { status: "discovered", videoId: null, candidateVideoIds: [] };
}

export function getDouyinSnapshotType(
  publishedAt: string | null,
  observedAt: string,
): "24h" | "72h" | null {
  if (!publishedAt) return null;
  const publishedMs = Date.parse(publishedAt);
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(publishedMs) || !Number.isFinite(observedMs)) return null;
  const ageHours = (observedMs - publishedMs) / (60 * 60 * 1000);
  if (ageHours >= 72) return "72h";
  if (ageHours >= 24) return "24h";
  return null;
}

export function mergeDouyinUserMetricRows(input: {
  fans: DouyinUserMetricRow[];
  likes: DouyinUserMetricRow[];
  videos: DouyinUserMetricRow[];
  profile: DouyinUserMetricRow[];
}): Array<{
  metricDate: string;
  newFans: number | null;
  totalFans: number | null;
  newLikes: number | null;
  newPlay: number | null;
  profileUv: number | null;
  newIssue: number | null;
  totalIssue: number | null;
}> {
  const byDate = new Map<string, {
    metricDate: string;
    newFans: number | null;
    totalFans: number | null;
    newLikes: number | null;
    newPlay: number | null;
    profileUv: number | null;
    newIssue: number | null;
    totalIssue: number | null;
  }>();

  for (const row of [...input.fans, ...input.likes, ...input.videos, ...input.profile]) {
    const target = byDate.get(row.date) ?? {
      metricDate: row.date,
      newFans: null,
      totalFans: null,
      newLikes: null,
      newPlay: null,
      profileUv: null,
      newIssue: null,
      totalIssue: null,
    };
    target.newFans = row.newFans ?? target.newFans;
    target.totalFans = row.totalFans ?? target.totalFans;
    target.newLikes = row.newLikes ?? target.newLikes;
    target.newPlay = row.newPlay ?? target.newPlay;
    target.profileUv = row.profileUv ?? target.profileUv;
    target.newIssue = row.newIssue ?? target.newIssue;
    target.totalIssue = row.totalIssue ?? target.totalIssue;
    byDate.set(row.date, target);
  }

  return [...byDate.values()].sort((a, b) => a.metricDate.localeCompare(b.metricDate));
}

function isWithin72Hours(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && Math.abs(leftMs - rightMs) <= 72 * 60 * 60 * 1000;
}

function normalizedTitle(value: string | null): string {
  return (value ?? "").replace(/\s+/g, "").trim().toLocaleLowerCase();
}
