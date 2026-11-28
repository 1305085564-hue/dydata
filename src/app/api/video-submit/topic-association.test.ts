import assert from "node:assert/strict";
import test from "node:test";

import { completeWritingOnSubmission, validateTopicForSubmission } from "./topic-association";

const TOPIC_ID = "123e4567-e89b-12d3-a456-426614174000";

const actor = { userId: "user-1", teamId: "team-1" };
function createFakeSupabase(subTopics: Array<Record<string, unknown>>, claims: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      const rows = table === "profiles" ? [{ id: actor.userId, team_id: actor.teamId, membership_status: "active" }]
        : table === "sub_topics" ? subTopics : claims;
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      const execute = (single = false) => {
        const selected = rows.filter((row) => filters.every((filter) => filter(row)));
        if (patch) selected.forEach((row) => Object.assign(row, patch));
        return { data: single ? selected[0] ?? null : selected, error: null };
      };
      const query = {
        select() { return query; },
        update(value: Record<string, unknown>) { patch = value; return query; },
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
        maybeSingle: async () => execute(true),
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(execute()).then(resolve); },
      };
      return query;
    },
  } as never;
}

test("没有选题关联时保持兼容", async () => {
  assert.deepEqual(await validateTopicForSubmission(createFakeSupabase([], []), null, actor), { ok: true });
});

test("选题真实存在且在库时允许提交，不要求先认领", async () => {
  const supabase = createFakeSupabase([{ id: TOPIC_ID, created_by: actor.userId, library_status: "in_library" }], []);
  assert.deepEqual(await validateTopicForSubmission(supabase, TOPIC_ID, actor), { ok: true });
});

test("不存在或已移出的选题不能伪造为提交关联", async () => {
  const missing = await validateTopicForSubmission(createFakeSupabase([], []), TOPIC_ID, actor);
  assert.deepEqual(missing, { ok: false, status: 404, message: "所选选题不存在" });

  const removed = await validateTopicForSubmission(
    createFakeSupabase([{ id: TOPIC_ID, created_by: actor.userId, library_status: "removed" }], []),
    TOPIC_ID, actor,
  );
  assert.deepEqual(removed, { ok: false, status: 409, message: "该选题已被移出选题库，不能关联提交" });
});

test("提交成功后结束正在写状态；无在写记录时静默跳过（幂等）", async () => {
  const claims = [
    { id: "claim-1", sub_topic_id: TOPIC_ID, user_id: "user-1", status: "writing" },
  ];
  const supabase = createFakeSupabase([], claims);
  const ended = await completeWritingOnSubmission(supabase, "user-1", TOPIC_ID, "video-1");
  assert.deepEqual(ended, { ended: true });
  assert.equal((claims[0] as Record<string, unknown>).status, "completed");
  assert.equal((claims[0] as Record<string, unknown>).completed_video_id, "video-1");

  const again = await completeWritingOnSubmission(supabase, "user-1", TOPIC_ID, "video-1");
  assert.deepEqual(again, { ended: false });

  const none = await completeWritingOnSubmission(supabase, "user-1", null, "video-1");
  assert.deepEqual(none, { ended: false });
});

test("选题关联查询失败返回固定中文 500，并记录真实错误", async () => {
  const raw = { message: 'relation "sub_topics" does not exist', code: "42P01" };
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    const client = { from: (table: string) => {
      if (table === "profiles") return (createFakeSupabase([], []) as { from: (table: string) => unknown }).from(table);
      const query = { select: () => query, eq: () => query, in: () => query, maybeSingle: async () => ({ data: null, error: raw }) };
      return query;
    } } as never;
    const result = await validateTopicForSubmission(client, TOPIC_ID, actor);
    assert.deepEqual(result, { ok: false, status: 500, message: "加载所选选题失败，请稍后重试" });
    assert.equal(logs[0][1], raw);
  } finally { console.error = original; }
});

test("提交不能挂接另一团队的选题，也不能在无团队时挂接", async () => {
  const client = createFakeSupabase([{ id: TOPIC_ID, created_by: "other-team-member", library_status: "in_library" }], []);
  assert.deepEqual(await validateTopicForSubmission(client, TOPIC_ID, actor), { ok: false, status: 404, message: "所选选题不存在" });
  assert.equal((await validateTopicForSubmission(client, TOPIC_ID, { ...actor, teamId: null })).ok, false);
});
