import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryReportPayload, resolveImmutablePublishedAt } from "./history";

test("history editing keeps the stored published time", () => {
  assert.equal(
    resolveImmutablePublishedAt("2026-09-20T17:54:00.000Z", "2026-09-21T09:00:00.000Z"),
    "2026-09-20T17:54:00.000Z",
  );
});

test("new historical records can use the submitted fact", () => {
  assert.equal(resolveImmutablePublishedAt(null, "2026-09-21T09:00:00.000Z"), "2026-09-21T09:00:00.000Z");
});

test("history report payload uses the shared field contract", () => {
  const payload = buildHistoryReportPayload({
    userId: "user-1",
    accountId: "account-1",
    title: "标题",
    submitter: "阿禅",
    reportDate: "2026-10-01",
    playCount: 100,
    completionRate: "30%",
    avgPlayDuration: "12秒",
    bounceRate2s: null,
    completionRate5s: null,
    likes: 1,
    comments: 2,
    shares: 3,
    favorites: 4,
    followerGain: 5,
    followerConvert: null,
    content: "文案",
    publishedAt: "2026-10-01T10:00:00.000Z",
    uploadedAt: "2026-10-01T02:00:00.000Z",
    assignees: {
      script_author_user_id: "user-1",
      video_editor_user_id: null,
      operator_user_id: "user-1",
    },
  });
  assert.equal(payload.account_id, "account-1");
  assert.equal(payload.published_at, "2026-10-01T10:00:00.000Z");
  assert.equal(payload.script_author_user_id, "user-1");
});
