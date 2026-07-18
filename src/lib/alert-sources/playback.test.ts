import test from "node:test";
import assert from "node:assert/strict";

import { detectPlaybackAlerts } from "./playback";

function client(result: { data: unknown[] | null; error: { message: string } | null }) {
  const query = { select: () => query, in: () => query, gte: () => query, lte: () => query, order: () => Promise.resolve(result) };
  return { from: () => query };
}
const scope = { actorUserId: "o1", businessRole: "owner", teamId: null, visibleUserIds: ["u1"] } as const;

test("近两日 10 万播放生成爆款告警", async () => {
  const now = new Date("2026-07-18T04:00:00.000Z");
  const alerts = await detectPlaybackAlerts({ supabase: client({ data: [{ user_id: "u1", report_date: "2026-07-18", play_count: 150000, account_id: "a1", submitter: "小陈", accounts: { id: "a1", name: "主号", content_direction: null } }], error: null }) as never, scope: scope as never, now });
  assert.equal(alerts.some((alert) => alert.title === "新爆款诞生"), true);
});

test("空可见成员返回空，查询错误抛异常", async () => {
  assert.deepEqual(await detectPlaybackAlerts({ supabase: client({ data: [], error: null }) as never, scope: { ...scope, visibleUserIds: [] } as never }), []);
  await assert.rejects(() => detectPlaybackAlerts({ supabase: client({ data: null, error: { message: "db down" } }) as never, scope: scope as never }), /db down/);
});
