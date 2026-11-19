import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "dotenv";

const { Client } = createRequire(import.meta.url)("pg");
const env = parse(readFileSync(".env.ai-test.local"));

type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>; connect: () => Promise<void>; end: () => Promise<void> };
type Window = { calls: number; successRate: number | null; avgMs: number | null };
type Stats = {
  channels: Array<{ keyModelId: string; recent: Window; recent1000: Window }>;
  features: Array<{ featureKey: string; recent: Window & { rescuedCount: number }; recent1000: Window & { rescuedCount: number } }>;
  recentFailures: Array<{ isProbe: boolean; rescued: boolean }>;
};

async function inTransaction(run: (db: Db) => Promise<void>) {
  const target = new URL(env.SUPABASE_DB_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
  assert.equal(target.port, "54322");
  const db = new Client({ connectionString: target.href }) as Db;
  await db.connect();
  try {
    await db.query("begin");
    await run(db);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}

test("AI 调用统计按 3 天近期窗口、成功平均耗时和请求级救回聚合", async () => {
  await inTransaction(async (db) => {
    const keyModelId = randomUUID();
    const keyId = randomUUID();
    const now = new Date();
    const at = (daysAgo: number, minutesAgo = 0) => new Date(now.getTime() - (daysAgo * 24 * 60 + minutesAgo) * 60_000).toISOString();
    const insert = async (row: Record<string, unknown>) => {
      await db.query(
        `insert into public.ai_call_attempts
          (created_at, request_id, attempt_no, feature_key, model_id, key_model_id, key_id, is_success, error_kind, error_message, duration_ms, is_probe)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [row.created_at, row.request_id, row.attempt_no, row.feature_key, row.model_id, row.key_model_id, row.key_id, row.is_success, row.error_kind, row.error_message, row.duration_ms, row.is_probe],
      );
    };

    await insert({ created_at: at(4), request_id: randomUUID(), attempt_no: 1, feature_key: "old_feature", model_id: "model-a", key_model_id: keyModelId, key_id: keyId, is_success: true, error_kind: null, error_message: null, duration_ms: 900, is_probe: false });
    const rescuedRequest = randomUUID();
    await insert({ created_at: at(2, 20), request_id: rescuedRequest, attempt_no: 1, feature_key: "rescue_feature", model_id: "model-a", key_model_id: keyModelId, key_id: keyId, is_success: false, error_kind: "服务端", error_message: "temporary", duration_ms: 20, is_probe: false });
    await insert({ created_at: at(2, 19), request_id: rescuedRequest, attempt_no: 2, feature_key: "rescue_feature", model_id: "model-a", key_model_id: keyModelId, key_id: keyId, is_success: true, error_kind: null, error_message: null, duration_ms: 80, is_probe: false });
    const failedRequest = randomUUID();
    await insert({ created_at: at(1), request_id: failedRequest, attempt_no: 1, feature_key: "rescue_feature", model_id: "model-a", key_model_id: keyModelId, key_id: keyId, is_success: false, error_kind: "限流", error_message: "rate", duration_ms: 30, is_probe: false });
    await insert({ created_at: at(1, 1), request_id: randomUUID(), attempt_no: 1, feature_key: "failure_only", model_id: "model-a", key_model_id: keyModelId, key_id: keyId, is_success: false, error_kind: "网络", error_message: "offline", duration_ms: 50, is_probe: false });
    await insert({ created_at: at(1, 2), request_id: randomUUID(), attempt_no: 1, feature_key: "rescue_feature", model_id: "model-a", key_model_id: keyModelId, key_id: keyId, is_success: false, error_kind: "鉴权", error_message: "manual", duration_ms: 4, is_probe: true });

    const result = (await db.query("select public.get_ai_call_stats() as stats")).rows[0].stats as Stats;
    const channel = result.channels.find((item) => item.keyModelId === keyModelId);
    assert.ok(channel);
    assert.deepEqual(channel.recent, { calls: 4, successRate: 0.25, avgMs: 80 });
    assert.deepEqual(channel.recent1000, { calls: 5, successRate: 0.4, avgMs: 490 });

    const rescueFeature = result.features.find((item) => item.featureKey === "rescue_feature");
    assert.ok(rescueFeature);
    assert.deepEqual(rescueFeature.recent, { calls: 2, successRate: 0.5, avgMs: 100, rescuedCount: 1 });

    const failureOnly = result.features.find((item) => item.featureKey === "failure_only");
    assert.ok(failureOnly);
    assert.deepEqual(failureOnly.recent, { calls: 1, successRate: 0, avgMs: null, rescuedCount: 0 });

    const oldFeature = result.features.find((item) => item.featureKey === "old_feature");
    assert.ok(oldFeature);
    assert.deepEqual(oldFeature.recent, { calls: 0, successRate: null, avgMs: null, rescuedCount: 0 });

    const probeFailure = result.recentFailures.find((item) => item.isProbe);
    assert.ok(probeFailure, "手动检测失败仍出现在失败流水");
    assert.equal(probeFailure?.rescued, false);
  });
});
