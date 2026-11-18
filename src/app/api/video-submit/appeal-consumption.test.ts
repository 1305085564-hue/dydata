import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  appealCoversSubmission,
  consumeApprovedAppealPayload,
  findApprovedAppealForSubmission,
} from "./appeal-consumption";
import { validateVideoSubmitPayload } from "./validation";

const asset = (role: "screenshot_1" | "screenshot_2") => ({
  role,
  url: `https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2F${role}%2Fshot.png`,
  confirmed: true,
  confidence_score: 1,
  screenshot_type: role === "screenshot_1" ? "data" : "retention",
});

const payload = (title: string) => ({
  account_id: "acc-1",
  biz_date: "2026-11-10",
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

function submitted(title: string, patch: Record<string, unknown> = {}) {
  const result = validateVideoSubmitPayload({ ...payload(title), ...patch });
  assert.ok(result.ok);
  return result.normalized;
}

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
  const { admin, calls } = fakeAdmin();
  const outcome = await consumeApprovedAppealPayload({ admin, appeal: { id: "appeal-1", submission_payload: payload("补交作品 A") }, submitted: submitted("补交作品 A") });
  assert.equal(outcome, "cleared");
  assert.deepEqual(calls[0].patch, { submission_payload: null });
  assert.deepEqual(calls[0].filters, [["id", "appeal-1"], ["status", "approved"]]);
});

test("员工续交时改了数字：仍是同一条作品，照样收口", async () => {
  const { admin } = fakeAdmin();
  const edited = submitted("补交作品 A", { metrics: { ...payload("x").metrics, play_count: 999, likes: 77 } });
  const outcome = await consumeApprovedAppealPayload({ admin, appeal: { id: "appeal-1", submission_payload: payload("补交作品 A") }, submitted: edited });
  assert.equal(outcome, "cleared");
});

test("凭同一账号同一天的资格提交了另一条作品：不清别的作品的待续交数据", async () => {
  const { admin, calls } = fakeAdmin();
  const outcome = await consumeApprovedAppealPayload({ admin, appeal: { id: "appeal-1", submission_payload: payload("补交作品 A") }, submitted: submitted("另一条作品 B") });
  assert.equal(outcome, "skipped");
  assert.equal(calls.length, 0);
});

test("没有用到补交资格或暂存已清空：什么都不做", async () => {
  const { admin, calls } = fakeAdmin();
  assert.equal(await consumeApprovedAppealPayload({ admin, appeal: null, submitted: submitted("A") }), "skipped");
  assert.equal(await consumeApprovedAppealPayload({ admin, appeal: { id: "a", submission_payload: null }, submitted: submitted("A") }), "skipped");
  assert.equal(calls.length, 0);
});

test("清空失败只记日志，不影响本次提交结果", async () => {
  const { admin } = fakeAdmin({ error: { message: "db down" } });
  const originalError = console.error;
  console.error = () => {};
  try {
    const outcome = await consumeApprovedAppealPayload({ admin, appeal: { id: "appeal-1", submission_payload: payload("补交作品 A") }, submitted: submitted("补交作品 A") });
    assert.equal(outcome, "failed");
  } finally {
    console.error = originalError;
  }
});

test("补交批准只放行申请的那条作品：同标题同发布日改了数字仍放行，同日另一条被拦", () => {
  const stored = payload("补交作品 A");
  assert.equal(appealCoversSubmission(stored, submitted("补交作品 A")), true);
  assert.equal(
    appealCoversSubmission(stored, submitted("补交作品 A", { metrics: { ...payload("x").metrics, play_count: 5 } })),
    true,
  );
  assert.equal(appealCoversSubmission(stored, submitted("同日另一条超时作品")), false);
  assert.equal(appealCoversSubmission(stored, submitted("补交作品 A", { published_at: "2026-11-09T20:00:00+08:00" })), false);
  assert.equal(appealCoversSubmission(stored, submitted("补交作品 A", { account_id: "acc-2" })), false);
  // 暂存已清空（已用过）或无法解析：不再放行
  assert.equal(appealCoversSubmission(null, submitted("补交作品 A")), false);
  assert.equal(appealCoversSubmission({ broken: true }, submitted("补交作品 A")), false);
});

function fakeUserClient(rows: Array<{ id: string; submission_payload: unknown }>, error: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    select() { return builder; },
    eq(column: string, value: unknown) { filters.push([column, value]); return builder; },
    order() { return builder; },
    then(resolve: (value: { data: unknown; error: unknown }) => void) { resolve({ data: rows, error }); },
  };
  return { supabase: { from: () => builder } as unknown as SupabaseClient, filters };
}

test("找放行资格：同日有多条已批准申请时，取与本次作品对得上的那条", async () => {
  const { supabase, filters } = fakeUserClient([
    { id: "appeal-b", submission_payload: payload("作品 B") },
    { id: "appeal-a", submission_payload: payload("作品 A") },
    { id: "appeal-used", submission_payload: null },
  ]);
  const found = await findApprovedAppealForSubmission({ supabase, userId: "user-1", submitted: submitted("作品 A") });
  assert.equal(found.failed, false);
  assert.equal(found.appeal?.id, "appeal-a");
  assert.deepEqual(filters, [["user_id", "user-1"], ["account_id", "acc-1"], ["record_date", "2026-11-10"], ["status", "approved"]]);
});

test("找放行资格：已批准申请都不是这条作品（含已用过的）时没有资格；查询失败单独标记", async () => {
  const none = await findApprovedAppealForSubmission({
    supabase: fakeUserClient([{ id: "used", submission_payload: null }, { id: "b", submission_payload: payload("作品 B") }]).supabase,
    userId: "user-1", submitted: submitted("作品 A"),
  });
  assert.deepEqual(none, { appeal: null, failed: false });
  const failed = await findApprovedAppealForSubmission({
    supabase: fakeUserClient([], { message: "boom" }).supabase, userId: "user-1", submitted: submitted("作品 A"),
  });
  assert.deepEqual(failed, { appeal: null, failed: true });
});
