import assert from "node:assert/strict";
import test from "node:test";

import { completeWritingOnSubmission, validateTopicForSubmission } from "./topic-association";

const TOPIC_ID = "123e4567-e89b-12d3-a456-426614174000";

function createFakeSupabase(subTopics: Array<Record<string, unknown>>, claims: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      const rows = table === "sub_topics" ? subTopics : table === "sub_topic_claims" ? claims : [];
      return {
        select(_columns?: string) {
          return {
            eq(col: string, val: unknown) {
              const filtered = rows.filter((row) => row[col] === val);
              return {
                maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              let applied = 0;
              for (const row of rows) {
                if (row[col] === val && row.status === "writing") {
                  Object.assign(row, patch);
                  applied += 1;
                }
              }
              return {
                eq(_col: string, _val: unknown) {
                  return {
                    eq(_col2: string, _val2: unknown) {
                      return {
                        select() {
                          return {
                            maybeSingle: async () => ({ data: applied > 0 ? { id: "claim-1" } : null, error: null }),
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as never;
}

test("没有选题关联时保持兼容", async () => {
  assert.deepEqual(await validateTopicForSubmission(createFakeSupabase([], []), null), { ok: true });
});

test("选题真实存在且在库时允许提交，不要求先认领", async () => {
  const supabase = createFakeSupabase([{ id: TOPIC_ID, library_status: "in_library" }], []);
  assert.deepEqual(await validateTopicForSubmission(supabase, TOPIC_ID), { ok: true });
});

test("不存在或已移出的选题不能伪造为提交关联", async () => {
  const missing = await validateTopicForSubmission(createFakeSupabase([], []), TOPIC_ID);
  assert.deepEqual(missing, { ok: false, status: 404, message: "所选选题不存在" });

  const removed = await validateTopicForSubmission(
    createFakeSupabase([{ id: TOPIC_ID, library_status: "removed" }], []),
    TOPIC_ID,
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
