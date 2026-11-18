import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { consumeApprovedAppealPayload, resolveAppealPayloadRecordId } from "./appeal-consumption";

const asset = (role: "screenshot_1" | "screenshot_2") => ({
  role,
  url: `https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2F${role}%2Fshot.png`,
  confirmed: true,
  confidence_score: 1,
  screenshot_type: role === "screenshot_1" ? "data" : "retention",
});

const payload = (title: string) => ({
  account_id: "acc-1",
  video_title: title,
  content: "文案",
  anomaly_status: "normal",
  topic_tag: "复盘",
  published_at: "2026-11-10T20:00:00+08:00",
  assets: [asset("screenshot_1"), asset("screenshot_2")],
  metrics: {
    play_count: 100, likes: 10, comments: 2, shares: 1, favorites: 3, follower_gain: 4, follower_loss: 0,
    follower_convert: 0, avg_play_duration: 12, bounce_rate_2s: 20, completion_rate_5s: 30, completion_rate: 40,
  },
});

function fakeAdmin(result: { error: unknown } = { error: null }) {
  const calls: Array<{ patch: unknown; filters: Array<[string, unknown]> }> = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "fulfillment_appeals");
      const call = { patch: undefined as unknown, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const builder = {
        update(patch: unknown) { call.patch = patch; return builder; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return builder; },
        then(resolve: (value: { error: unknown }) => void) { resolve(result); },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
}

test("凭资格提交的正是申请暂存的那条作品：清空暂存，申请收口为已提交", async () => {
  const stored = payload("补交作品 A");
  const recordId = resolveAppealPayloadRecordId(stored);
  assert.ok(recordId);
  const { admin, calls } = fakeAdmin();
  const outcome = await consumeApprovedAppealPayload({ admin, appeal: { id: "appeal-1", submission_payload: stored }, submittedRecordId: recordId! });
  assert.equal(outcome, "cleared");
  assert.deepEqual(calls[0].patch, { submission_payload: null });
  assert.deepEqual(calls[0].filters, [["id", "appeal-1"], ["status", "approved"]]);
});

test("凭同一账号同一天的资格提交了另一条作品：不清别的作品的待续交数据", async () => {
  const otherRecordId = resolveAppealPayloadRecordId(payload("另一条作品 B"));
  const { admin, calls } = fakeAdmin();
  const outcome = await consumeApprovedAppealPayload({ admin, appeal: { id: "appeal-1", submission_payload: payload("补交作品 A") }, submittedRecordId: otherRecordId! });
  assert.equal(outcome, "skipped");
  assert.equal(calls.length, 0);
});

test("没有用到补交资格或暂存已清空：什么都不做", async () => {
  const { admin, calls } = fakeAdmin();
  assert.equal(await consumeApprovedAppealPayload({ admin, appeal: null, submittedRecordId: "x" }), "skipped");
  assert.equal(await consumeApprovedAppealPayload({ admin, appeal: { id: "a", submission_payload: null }, submittedRecordId: "x" }), "skipped");
  assert.equal(calls.length, 0);
});

test("清空失败只记日志，不影响本次提交结果", async () => {
  const stored = payload("补交作品 A");
  const { admin } = fakeAdmin({ error: { message: "db down" } });
  const originalError = console.error;
  console.error = () => {};
  try {
    const outcome = await consumeApprovedAppealPayload({ admin, appeal: { id: "appeal-1", submission_payload: stored }, submittedRecordId: resolveAppealPayloadRecordId(stored)! });
    assert.equal(outcome, "failed");
  } finally {
    console.error = originalError;
  }
});
