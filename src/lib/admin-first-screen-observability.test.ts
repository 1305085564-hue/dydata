import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFirstScreenAlertText,
  queueFirstScreenObservation,
  recordFirstScreenObservation,
} from "./admin-first-screen-observability";

const observation = {
  route: "/admin/content",
  statusCode: 200,
  metrics: { auth: 1.4, context: 2.5, data: 3.6, total: 7.5 },
};

test("首屏观测按四舍五入后的毫秒落库", async () => {
  let inserted: unknown;
  const supabase = {
    from: () => ({
      insert: async (value: unknown) => {
        inserted = value;
        return { error: null };
      },
    }),
  };

  await recordFirstScreenObservation(observation, supabase as never);
  assert.deepEqual(inserted, {
    route: "/admin/content",
    status_code: 200,
    auth_ms: 1,
    context_ms: 3,
    data_ms: 4,
    total_ms: 8,
    actor_user_id: null,
    scope_kind: null,
    metadata: {},
  });
});

test("Supabase 返回 error 时抛出固定文案并隐藏数据库细节", async () => {
  const databaseError = { message: "relation public.secret_table does not exist", code: "42P01" };
  const supabase = {
    from: () => ({ insert: async () => ({ error: databaseError }) }),
  };

  await assert.rejects(
    recordFirstScreenObservation(observation, supabase as never),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "记录后台首屏观测失败");
      assert.equal(error.cause, databaseError);
      assert.doesNotMatch(JSON.stringify(error), /secret_table|42P01/);
      return true;
    },
  );
});

test("告警文本保留连续超阈值次数", () => {
  assert.match(
    buildFirstScreenAlertText({
      route: "/admin",
      statusCode: 500,
      latestTotalMs: 0,
      thresholdMs: 100,
      consecutiveHits: 3,
    }),
    /连续超阈值次数: 3/,
  );
});

test("后台记录失败会被吞掉并写入错误日志", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  await new Promise<void>((resolve) => {
    queueFirstScreenObservation(observation, {
      recordObservation: async () => {
        resolve();
        throw new Error("db down");
      },
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(logged.mock.callCount(), 1);
});
