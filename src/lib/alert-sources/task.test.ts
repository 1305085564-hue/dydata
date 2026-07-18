import test from "node:test";
import assert from "node:assert/strict";

import { detectTaskAlerts } from "./task";

function client(error: { message: string } | null = null) {
  const query = { select: () => query, eq: () => query, in: () => query, gte: () => query, lte: () => query, order: () => query, then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve({ data: [], error }).then(resolve, reject) };
  return { from: () => query };
}
const scope = { actorUserId: "o1", businessRole: "owner", teamId: null, visibleUserIds: ["u1"] } as const;

test("无待办和近期视频时返回空告警", async () => {
  assert.deepEqual(await detectTaskAlerts({ supabase: client() as never, scope: scope as never }), []);
  assert.deepEqual(await detectTaskAlerts({ supabase: client() as never, scope: { ...scope, visibleUserIds: [] } as never }), []);
});

test("查询错误抛出", async () => {
  await assert.rejects(() => detectTaskAlerts({ supabase: client({ message: "db down" }) as never, scope: scope as never }), /db down/);
});
