import test from "node:test";
import assert from "node:assert/strict";

import { detectConversionAlerts } from "./conversion";

function client(result: { data: unknown[] | null; error: { message: string } | null }) {
  const query = { select: () => query, in: () => query, gte: () => query, lte: () => Promise.resolve(result) };
  return { from: () => query };
}
const scope = { actorUserId: "o1", businessRole: "owner", teamId: null, visibleUserIds: ["u1"] } as const;

test("近三日有发布但导粉为 0 生成成员告警", async () => {
  const now = new Date("2026-07-18T04:00:00.000Z");
  const alerts = await detectConversionAlerts({ supabase: client({ data: [{ user_id: "u1", report_date: "2026-07-18", follower_convert: 0, submitter: "小陈" }], error: null }) as never, scope: scope as never, now });
  assert.equal(alerts[0]?.title, "有发布但 3 日导粉为 0");
});

test("空范围返回空，查询错误抛出", async () => {
  assert.deepEqual(await detectConversionAlerts({ supabase: client({ data: [], error: null }) as never, scope: { ...scope, visibleUserIds: [] } as never }), []);
  await assert.rejects(() => detectConversionAlerts({ supabase: client({ data: null, error: { message: "db down" } }) as never, scope: scope as never }), /db down/);
});
