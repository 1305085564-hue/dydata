import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAIM_STALE_MS,
  claimDailyReminders,
  transitionRemindClaims,
  type RemindClaimMember,
} from "./remind-claim";
import { FakeRemindTable, makeClient } from "./remind-claim.test-helpers";

const members: RemindClaimMember[] = [
  { user_id: "11111111-1111-1111-1111-111111111111", name: "甲" },
  { user_id: "22222222-2222-2222-2222-222222222222", name: "乙" },
];
const today = "2026-08-23";

test("两个并发 claim 只有一个成功：第二个在发送前即被跳过", async () => {
  const table = new FakeRemindTable();
  const clientA = makeClient(table);
  const clientB = makeClient(table);

  const outcomeA = await claimDailyReminders(clientA, today, members);
  assert.equal(outcomeA.mode, "claimed");
  assert.equal(outcomeA.claims.length, 2);

  // A 尚未流转时 B 进入：全部撞活跃 sending 锁
  const outcomeB = await claimDailyReminders(clientB, today, members);
  assert.equal(outcomeB.mode, "claimed");
  assert.equal(outcomeB.claims.length, 0);
  assert.deepEqual(outcomeB.skippedConcurrent, members);
});

test("已 success 的成员同样被并发方跳过", async () => {
  const table = new FakeRemindTable();
  table.insertRow({ user_id: members[0]!.user_id, status: "success", target_date: today });

  const outcome = await claimDailyReminders(makeClient(table), today, members);

  assert.deepEqual(outcome.claims.map((c) => c.member.name), ["乙"]);
  assert.deepEqual(outcome.skippedConcurrent, [members[0]]);
});

test("崩溃残留的过期 sending 会被原子接管（拿到同一行 id 且刷新 sent_at）", async () => {
  const table = new FakeRemindTable();
  const staleAt = new Date(Date.now() - CLAIM_STALE_MS - 60_000).toISOString();
  const staleRow = table.insertRow({
    user_id: members[0]!.user_id,
    status: "sending",
    sent_at: staleAt,
    target_date: today,
  });

  const outcome = await claimDailyReminders(makeClient(table), today, [members[0]!]);

  assert.equal(outcome.claims.length, 1);
  assert.equal(outcome.claims[0]?.id, staleRow.id);
  assert.equal(outcome.skippedConcurrent.length, 0);
  const after = table.rows.find((row) => row.id === staleRow.id)!;
  assert.ok(Date.parse(after.sent_at) > Date.parse(staleAt));
});

test("新鲜的 sending 不被接管", async () => {
  const table = new FakeRemindTable();
  table.insertRow({
    user_id: members[0]!.user_id,
    status: "sending",
    sent_at: new Date().toISOString(),
    target_date: today,
  });

  const outcome = await claimDailyReminders(makeClient(table), today, [members[0]!]);

  assert.equal(outcome.claims.length, 0);
  assert.deepEqual(outcome.skippedConcurrent, [members[0]]);
});

test("check 约束拒绝（migration 未执行）→ legacy 降级且不再写任何 sending 行", async () => {
  const table = new FakeRemindTable();
  const client = makeClient(table, { insertErrorCode: "23514" });

  const outcome = await claimDailyReminders(client, today, members);

  assert.equal(outcome.mode, "legacy");
  assert.equal(outcome.claims.length, 0);
  assert.equal(table.rows.length, 0);
});

test("其他插入错误计入 claimFailedNames，不中断后续成员", async () => {
  let n = 0;
  const table = new FakeRemindTable();
  const base = makeClient(table);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flaky: any = {
    from(name: string) {
      n += 1;
      if (n === 1) {
        return {
          insert() {
            return {
              select() {
                return Promise.resolve({ data: null, error: { code: "57040", message: "insufficient privilege" } });
              },
            };
          },
        };
      }
      return base.from(name);
    },
  };

  const outcome = await claimDailyReminders(flaky, today, members);

  assert.equal(outcome.claimFailedNames.length, 1);
  assert.equal(outcome.claimFailedNames[0], members[0]?.name);
  assert.equal(outcome.claims.length, 1);
});

test("成功流转只更新自己抢到的 claim，不碰其他请求的记录", async () => {
  const table = new FakeRemindTable();
  const mine = table.insertRow({ user_id: "a-user", status: "sending" });
  const theirs = table.insertRow({ user_id: "b-user", status: "sending" });

  const result = await transitionRemindClaims(makeClient(table), {
    claimIds: [mine.id],
    toStatus: "success",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.transitionedIds, [mine.id]);
  assert.equal(table.rows.find((row) => row.id === mine.id)?.status, "success");
  assert.equal(table.rows.find((row) => row.id === theirs.id)?.status, "sending");
});

test("失败流转只更新自己抢到的 claim，并携带 response_body", async () => {
  const table = new FakeRemindTable();
  const mine = table.insertRow({ user_id: "a-user", status: "sending" });
  const theirs = table.insertRow({ user_id: "b-user", status: "sending" });

  await transitionRemindClaims(makeClient(table), {
    claimIds: [mine.id],
    toStatus: "failed",
    responseBody: "飞书 webhook 超时",
  });

  const mineRow = table.rows.find((row) => row.id === mine.id)!;
  const theirsRow = table.rows.find((row) => row.id === theirs.id)!;
  assert.equal(mineRow.status, "failed");
  assert.equal(mineRow.response_body, "飞书 webhook 超时");
  assert.equal(theirsRow.status, "sending");
});

test("部分流转失败返回 ok:false 并列出已流转 id", async () => {
  const table = new FakeRemindTable();
  const a = table.insertRow({ user_id: "a-user", status: "sending" });
  const b = table.insertRow({ user_id: "b-user", status: "success" }); // 不匹配 sending 条件

  const result = await transitionRemindClaims(makeClient(table), {
    claimIds: [a.id, b.id],
    toStatus: "success",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.transitionedIds, [a.id]);
});
