import test from "node:test";
import assert from "node:assert/strict";

import { detectSubmissionAlerts } from "./submission";

function client(error: { message: string } | null = null) {
  const query = { select: () => query, eq: () => query, in: () => query, gte: () => query, lte: () => query, then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve({ data: [], error }).then(resolve, reject) };
  return { from: () => query };
}
const scope = { actorUserId: "o1", businessRole: "owner", teamId: null, visibleUserIds: ["u1"] } as const;

test("无成员和填报数据时返回空告警", async () => {
  const now = new Date("2026-07-18T04:00:00.000Z");
  assert.deepEqual(await detectSubmissionAlerts({ supabase: client() as never, scope: scope as never, now }), []);
  assert.deepEqual(await detectSubmissionAlerts({ supabase: client() as never, scope: { ...scope, visibleUserIds: [] } as never, now }), []);
});

test("查询错误抛出", async () => {
  await assert.rejects(() => detectSubmissionAlerts({ supabase: client({ message: "db down" }) as never, scope: scope as never, now: new Date("2026-07-18T04:00:00.000Z") }), /db down/);
});
