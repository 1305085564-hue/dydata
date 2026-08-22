import assert from "node:assert/strict";
import test from "node:test";

import { claimDailyReminders, transitionRemindClaims } from "./remind-claim";

type InsertResult = { error: { code?: string; message?: string } | null };

function makeClient(script: (payload: { status?: string; user_id?: string }) => InsertResult) {
  const calls: Array<{ status?: string; user_id?: string }> = [];
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(table: string) {
      assert.equal(table, "remind_logs");
      return {
        insert(payload: { status?: string; user_id?: string }) {
          calls.push(payload);
          const result = script(payload);
          return {
            async then(resolve: (value: InsertResult) => void) {
              resolve(result);
            },
          };
        },
      };
    },
  };
}

const members = [
  { user_id: "11111111-1111-1111-1111-111111111111", name: "甲" },
  { user_id: "22222222-2222-2222-2222-222222222222", name: "乙" },
];

test("抢占成功：全部成员获得发送权，status=sending", async () => {
  const client = makeClient(() => ({ error: null }));

  const outcome = await claimDailyReminders(client, "2026-08-23", members);

  assert.equal(outcome.mode, "claimed");
  assert.deepEqual(outcome.claimed, members);
  assert.equal(outcome.skippedConcurrent.length, 0);
  for (const call of client.calls) {
    assert.equal(call.status, "sending");
  }
});

test("唯一冲突（23505）的成员被跳过，其余照常抢占", async () => {
  const client = makeClient((payload) =>
    payload.user_id === members[0]?.user_id
      ? { error: { code: "23505" } }
      : { error: null },
  );

  const outcome = await claimDailyReminders(client, "2026-08-23", members);

  assert.equal(outcome.mode, "claimed");
  assert.deepEqual(outcome.claimed, [members[1]]);
  assert.deepEqual(outcome.skippedConcurrent, [members[0]]);
});

test("check 约束拒绝（23514）→ legacy 模式，调用方退回旧行为", async () => {
  const client = makeClient(() => ({ error: { code: "23514" } }));

  const outcome = await claimDailyReminders(client, "2026-08-23", members);

  assert.equal(outcome.mode, "legacy");
  assert.equal(outcome.claimed.length, 0);
  // 首个成员即失败，不得继续给后续成员写 sending 占位
  assert.equal(client.calls.length, 1);
});

test("其他插入错误计入 claimFailedNames，不中断后续抢占", async () => {
  let n = 0;
  const client = makeClient(() => {
    n += 1;
    return n === 1 ? { error: { code: "57040" } } : { error: null };
  });

  const outcome = await claimDailyReminders(client, "2026-08-23", members);

  assert.equal(outcome.mode, "claimed");
  assert.deepEqual(outcome.claimFailedNames, [members[0]?.name]);
  assert.deepEqual(outcome.claimed, [members[1]]);
});

test("异常抛出（网络断开）也按失败处理，不向外抛异常", async () => {
  const client = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from() {
      return {
        insert() {
          throw new Error("connection refused");
        },
      };
    },
  };

  const outcome = await claimDailyReminders(client, "2026-08-23", members);

  assert.equal(outcome.mode, "claimed");
  assert.deepEqual(outcome.claimFailedNames, ["甲", "乙"]);
});

test("transitionRemindClaims 更新失败返回 false，不抛异常", async () => {
  const failing = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(table: string) {
      assert.equal(table, "remind_logs");
      return {
        update() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return Promise.resolve({ error: { message: "update failed" } });
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
  assert.equal(
    await transitionRemindClaims(failing, {
      targetDate: "2026-08-23",
      userIds: ["11111111-1111-1111-1111-111111111111"],
      toStatus: "success",
    }),
    false,
  );

  const ok = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from() {
      return {
        update() {
          return {
            eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
          };
        },
      };
    },
  };
  assert.equal(
    await transitionRemindClaims(ok, {
      targetDate: "2026-08-23",
      userIds: [],
      toStatus: "failed",
      responseBody: "x",
    }),
    true,
  );
});
