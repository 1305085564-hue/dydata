import assert from "node:assert/strict";
import test from "node:test";

import {
  claimDailyReminders,
  type ActiveClaim,
  type RemindClaimMember,
} from "./remind-claim";
import { dispatchReminders, type FeishuSendOutcome } from "./remind-dispatch";
import { makeClient, FakeRemindTable } from "./remind-claim.test-helpers";

const today = "2026-08-23";
const member: RemindClaimMember = { user_id: "11111111-1111-1111-1111-111111111111", name: "甲" };

function okSend(calls: string[]): () => Promise<FeishuSendOutcome> {
  return async () => {
    calls.push("send");
    return { ok: true };
  };
}

function failSend(calls: string[], reason = "timeout"): () => Promise<FeishuSendOutcome> {
  return async () => {
    calls.push("send");
    return { ok: false, reason, status: 504 };
  };
}

test("发送成功：claim 流转为 success，无未落库成员", async () => {
  const table = new FakeRemindTable();
  const claimOutcome = await claimDailyReminders(makeClient(table), today, [member]);
  const calls: string[] = [];

  const result = await dispatchReminders({
    client: makeClient(table),
    today,
    claim: claimOutcome,
    recipients: claimOutcome.claims.map((c) => c.member),
    send: okSend(calls),
    describeFailure: (reason) => `原因:${reason}`,
  });

  assert.equal(result.delivered, true);
  assert.equal(result.unresolvedNames.length, 0);
  assert.deepEqual(calls, ["send"]);
  assert.equal(table.rows[0]?.status, "success");
});

test("发送成功但 success 流转失败：必须暴露未落库成员，不能伪装完全成功", async () => {
  const table = new FakeRemindTable();
  const claimOutcome = await claimDailyReminders(makeClient(table), today, [member]);

  // 让流转条件不满足：把 sending 行提前改成别的状态
  table.rows[0]!.status = "failed";

  const result = await dispatchReminders({
    client: makeClient(table),
    today,
    claim: claimOutcome,
    recipients: [member],
    send: okSend([]),
    describeFailure: (reason) => reason,
  });

  assert.equal(result.delivered, true);
  assert.deepEqual(result.unresolvedNames, [member.name]);
});

test("发送失败：claim 流转为 failed 且带失败原因；流转成功则无未落库", async () => {
  const table = new FakeRemindTable();
  const claimOutcome = await claimDailyReminders(makeClient(table), today, [member]);
  const calls: string[] = [];

  const result = await dispatchReminders({
    client: makeClient(table),
    today,
    claim: claimOutcome,
    recipients: claimOutcome.claims.map((c) => c.member),
    send: failSend(calls, "timeout"),
    describeFailure: (reason) => `飞书 webhook ${reason}`,
  });

  assert.equal(result.delivered, false);
  assert.equal(result.failureReason, "timeout");
  assert.equal(result.unresolvedNames.length, 0);
  const row = table.rows[0]!;
  assert.equal(row.status, "failed");
  assert.match(row.response_body ?? "", /timeout/);
});

test("发送失败且 failed 流转也失败时，逐条补写 failed 记录兜底", async () => {
  const table = new FakeRemindTable();
  const claimOutcome = await claimDailyReminders(makeClient(table), today, [member]);
  // 预先破坏 sending 状态 → 流转匹配不到任何行
  table.rows[0]!.status = "success";

  const result = await dispatchReminders({
    client: makeClient(table),
    today,
    claim: claimOutcome,
    recipients: [member],
    send: failSend([], "non_2xx"),
    describeFailure: (reason) => `原因:${reason}`,
  });

  assert.equal(result.delivered, false);
  // 补写了一条 failed 记录，原 success 行未被触碰
  assert.equal(table.rows.filter((row) => row.status === "failed").length, 1);
  assert.equal(table.rows[0]?.status, "success");
  assert.equal(result.unresolvedNames.length, 0);
});

test("legacy 模式：逐条写日志，成功/失败分别记录，写入失败被带回", async () => {
  const table = new FakeRemindTable();
  const legacyOutcome = { mode: "legacy" as const, claims: [] as ActiveClaim[], skippedConcurrent: [], claimFailedNames: [] };

  const ok = await dispatchReminders({
    client: makeClient(table),
    today,
    claim: legacyOutcome,
    recipients: [member],
    send: okSend([]),
    describeFailure: (reason) => reason,
  });
  assert.equal(ok.delivered, true);
  assert.equal(table.rows[0]?.status, "success");

  const badTable = new FakeRemindTable();
  const fail = await dispatchReminders({
    client: makeClient(badTable),
    today,
    claim: legacyOutcome,
    recipients: [member],
    send: failSend([], "network"),
    describeFailure: (reason) => `原因:${reason}`,
  });
  assert.equal(fail.delivered, false);
  assert.equal(fail.unresolvedNames.length, 0);
  assert.equal(badTable.rows[0]?.status, "failed");
});

test("没有任何 claim 的第二个并发请求不会触发飞书发送", async () => {
  const table = new FakeRemindTable();
  // 第一个请求已完成抢占并流转 success
  const firstClaim = await claimDailyReminders(makeClient(table), today, [member]);
  void firstClaim;
  table.rows[0]!.status = "success";

  const secondClaim = await claimDailyReminders(makeClient(table), today, [member]);
  assert.equal(secondClaim.claims.length, 0);

  const result = await dispatchReminders({
    client: makeClient(table),
    today,
    claim: secondClaim,
    recipients: secondClaim.claims.map((c) => c.member),
    send: () => {
      throw new Error("第二个请求不应触发飞书发送");
    },
    describeFailure: (reason) => reason,
  });

  assert.equal(result.delivered, false);
  assert.equal(result.failureReason, "no_recipients");
});
