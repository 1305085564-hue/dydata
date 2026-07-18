import test from "node:test";
import assert from "node:assert/strict";

import { detectUploadAlerts } from "./upload";

function client(error: { message: string } | null = null) {
  const query = { select: () => query, in: () => query, is: () => query, gte: () => query, lte: () => query, order: () => query, then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve({ data: [], error }).then(resolve, reject) };
  return { from: () => query };
}
const scope = { actorUserId: "o1", businessRole: "owner", teamId: null, visibleUserIds: ["u1"] } as const;

test("无视频和质量问题时返回空告警", async () => {
  assert.deepEqual(await detectUploadAlerts({ supabase: client() as never, scope: scope as never }), []);
  assert.deepEqual(await detectUploadAlerts({ supabase: client() as never, scope: { ...scope, visibleUserIds: [] } as never }), []);
});

test("查询错误抛出", async () => {
  await assert.rejects(() => detectUploadAlerts({ supabase: client({ message: "db down" }) as never, scope: scope as never }), /db down/);
});
