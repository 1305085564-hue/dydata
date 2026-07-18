import test from "node:test";
import assert from "node:assert/strict";

import { detectViolationAlerts } from "./violation";

function client(pendingCount: number, weeklyData: unknown[] | null, error: { message: string } | null = null) {
  let call = 0;
  return { from: () => {
    call += 1;
    const result = call === 1 ? { count: pendingCount, data: null, error } : { count: null, data: weeklyData, error };
    const query = { select: () => query, eq: () => query, gte: () => query, lte: () => query, then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve(result).then(resolve, reject) };
    return query;
  } };
}
const ownerScope = { actorUserId: "o1", businessRole: "owner", teamId: null, visibleUserIds: [] } as const;

test("待复核达到 5 条生成严重告警", async () => {
  const alerts = await detectViolationAlerts({ supabase: client(5, []) as never, scope: ownerScope as never, now: new Date("2026-07-18T04:00:00.000Z") });
  assert.equal(alerts[0]?.severity, "critical");
  assert.match(alerts[0]?.detail ?? "", /5 条/);
});

test("负责人缺团队直接返回空，查询错误抛出", async () => {
  assert.deepEqual(await detectViolationAlerts({ supabase: client(0, []) as never, scope: { ...ownerScope, businessRole: "team_admin", teamId: null } as never }), []);
  await assert.rejects(() => detectViolationAlerts({ supabase: client(0, [], { message: "db down" }) as never, scope: ownerScope as never }), /db down/);
});
