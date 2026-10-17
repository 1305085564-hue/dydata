import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDouyinVideoMatch,
  getDouyinSnapshotType,
  mergeDouyinUserMetricRows,
} from "./reconciliation";

test("matches a provider item only by the same account and exact platform item id", () => {
  assert.deepEqual(
    classifyDouyinVideoMatch({
      accountId: "account-1",
      platformVideoId: "item-1",
      title: "标题",
      platformPublishedAt: "2026-10-18T02:00:00.000Z",
      existingVideos: [
        { id: "video-1", accountId: "account-1", douyinItemId: "item-1", title: "旧标题", publishedAt: "2026-10-18T02:00:00.000Z" },
        { id: "video-2", accountId: "account-2", douyinItemId: "item-1", title: "跨账号同 ID", publishedAt: "2026-10-18T02:00:00.000Z" },
      ],
    }),
    { status: "matched", videoId: "video-1", candidateVideoIds: ["video-1"] },
  );
});

test("does not auto-bind fuzzy title/date matches", () => {
  const result = classifyDouyinVideoMatch({
    accountId: "account-1",
    platformVideoId: "item-2",
    title: "标题 新版",
    platformPublishedAt: "2026-10-18T02:00:00.000Z",
    existingVideos: [
      { id: "video-1", accountId: "account-1", douyinItemId: null, title: "标题", publishedAt: "2026-10-18T04:00:00.000Z" },
    ],
  });

  assert.deepEqual(result, { status: "pending_review", videoId: null, candidateVideoIds: ["video-1"] });
});

test("only writes 24h and 72h snapshots after the corresponding platform age", () => {
  assert.equal(getDouyinSnapshotType("2026-10-17T00:00:00.000Z", "2026-10-17T12:00:00.000Z"), null);
  assert.equal(getDouyinSnapshotType("2026-10-16T00:00:00.000Z", "2026-10-17T01:00:00.000Z"), "24h");
  assert.equal(getDouyinSnapshotType("2026-10-14T00:00:00.000Z", "2026-10-17T01:00:00.000Z"), "72h");
});

test("merges independent user metric endpoints by date without turning missing data into zero", () => {
  const merged = mergeDouyinUserMetricRows({
    fans: [{ date: "2026-10-18", newFans: 3, totalFans: 100, newLikes: null, newPlay: null, profileUv: null, newIssue: null, totalIssue: null }],
    likes: [{ date: "2026-10-18", newFans: null, totalFans: null, newLikes: 8, newPlay: null, profileUv: null, newIssue: null, totalIssue: null }],
    videos: [],
    profile: [{ date: "2026-10-18", newFans: null, totalFans: null, newLikes: null, newPlay: null, profileUv: 4, newIssue: null, totalIssue: null }],
  });

  assert.deepEqual(merged, [{
    metricDate: "2026-10-18",
    newFans: 3,
    totalFans: 100,
    newLikes: 8,
    newPlay: null,
    profileUv: 4,
    newIssue: null,
    totalIssue: null,
  }]);
});
