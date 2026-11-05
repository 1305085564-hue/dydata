import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildAiConfigResponse } from "./route";
import { listRankedProviderKeyModels } from "@/lib/ai/provider-routing";

// Explicit opt-in: never fall back to a production URL or silently skip a requested run.
const url = process.env.AI_GOVERNANCE_TEST_URL;
test("渠道治理：真实本地库与管理接口闭环", { skip: !url }, async (t) => {
  assert.match(url!, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
  const env = parse(readFileSync(".env.ai-test.local"));
  const db = createClient(url!, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const actor = { createAdminClient: () => db as never, requireSystemActor: async () => ({ supabase: db as never, actor: { userId: "local-governance-test", role: "owner" } as never }) };
  const providerId = randomUUID();
  const keyIds = [randomUUID(), randomUUID(), randomUUID()];
  const modelA = `governance-a-${randomUUID()}`;
  const modelB = `governance-b-${randomUUID()}`;
  const featureKey = "content_tools";
  const previousBindings = await db.from("ai_feature_bindings").select("*").in("feature_key",[featureKey,"default"]);
  assert.equal(previousBindings.error,null);
  let upstreamStatus = 503;
  const server = createServer((_req, res) => {
    res.writeHead(upstreamStatus, { "content-type": "application/json", "x-request-id": "local-governance-probe" });
    res.end(JSON.stringify({ error: "service unavailable" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  async function action(action: string, data: Record<string, unknown>) {
    return buildAiConfigResponse(new NextRequest("http://localhost/api/admin/ai-config", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, data }),
    }), actor);
  }
  async function keys() {
    const result = await db.from("ai_provider_keys").select("*").in("id", keyIds).order("id");
    assert.equal(result.error, null); return result.data!;
  }
  async function ordered(modelId: string) {
    const result = await db.from("ai_provider_key_models").select("id, sort_order, key_id").eq("model_id", modelId).order("sort_order");
    assert.equal(result.error, null); return result.data!;
  }
  async function updateKey(patch: Record<string, unknown>) {
    const result = await db.from("ai_provider_keys").update(patch).eq("id", keyIds[0]); assert.equal(result.error, null);
  }
  try {
    assert.equal((await db.from("ai_providers").insert({ id: providerId, name: "本地渠道治理验收", base_url: `http://127.0.0.1:${port}/v1`, is_enabled: true, priority: 0 })).error, null);
    assert.equal((await db.from("ai_provider_keys").insert(keyIds.map((id) => ({ id, provider_id: providerId, label: `本地验收-${id}`, api_key: "local-only-fixture", priority: 55, available_models: [modelA, modelB], is_enabled: true })))).error, null);
    assert.equal((await db.from("ai_provider_key_models").insert([modelA, modelB].flatMap((model_id) => keyIds.map((key_id) => ({ key_id, model_id, is_enabled: true, global_is_enabled: true }))))).error, null);

    await t.test("相邻互换再反向完全还原，另一个模型与全局顺位不变", async () => {
      const before = await ordered(modelA); const other = await ordered(modelB); const keyBefore = await keys();
      const data = { model_id: modelA, key_model_id: before[0].id, target_key_model_id: before[1].id };
      assert.equal((await action("swap_model_channel_order", data)).status, 200);
      assert.deepEqual((await ordered(modelA)).map((r) => r.id), [before[1].id, before[0].id, before[2].id]);
      assert.deepEqual((await listRankedProviderKeyModels(db, modelA)).map((r) => r.providerKeyModelId), [before[1].id, before[0].id, before[2].id]);
      assert.equal((await action("swap_model_channel_order", data)).status, 200);
      assert.deepEqual(await ordered(modelA), before); assert.deepEqual(await ordered(modelB), other); assert.deepEqual(await keys(), keyBefore);
      assert.equal((await action("swap_model_channel_order", { ...data, target_key_model_id: before[2].id })).status, 409);
      assert.deepEqual(await ordered(modelA), before);
    });
    await t.test("中间隔失效或休眠渠道时可跳过交换，端点不可调度被拒绝", async () => {
      const rows = await ordered(modelA); const otherBefore = await ordered(modelB);
      assert.equal((await db.from("ai_provider_key_models").update({ invalidated_at: new Date().toISOString() }).eq("id", rows[1].id)).error, null);
      const data = { model_id: modelA, key_model_id: rows[0].id, target_key_model_id: rows[2].id };
      assert.equal((await action("swap_model_channel_order", data)).status, 200, "失效渠道不阻断两侧可用渠道的可调度相邻交换");
      assert.deepEqual((await ordered(modelA)).map((r) => r.id), [rows[2].id, rows[1].id, rows[0].id]);
      assert.equal((await action("swap_model_channel_order", data)).status, 200);
      assert.deepEqual(await ordered(modelA), rows);
      assert.equal((await action("swap_model_channel_order", { model_id: modelA, key_model_id: rows[1].id, target_key_model_id: rows[2].id })).status, 409, "失效端点拒绝交换");
      assert.equal((await db.from("ai_provider_key_models").update({ invalidated_at: null }).eq("id", rows[1].id)).error, null);
      assert.equal((await db.from("ai_provider_key_models").update({ unhealthy_until: new Date(Date.now() + 60_000).toISOString() }).eq("id", rows[0].id)).error, null);
      assert.equal((await action("swap_model_channel_order", { model_id: modelA, key_model_id: rows[0].id, target_key_model_id: rows[1].id })).status, 409, "自动冷却中的端点拒绝交换");
      assert.equal((await db.from("ai_provider_key_models").update({ unhealthy_until: null }).eq("id", rows[0].id)).error, null);
      assert.deepEqual(await ordered(modelA), rows); assert.deepEqual(await ordered(modelB), otherBefore);
    });
    await t.test("旧手动休眠动作明确拒绝，遗留字段不影响调度", async () => {
      const until = new Date(Date.now() + 30 * 60_000).toISOString();
      await updateKey({ manual_sleep_until: until });
      const before = await keys();
      assert.equal((await action("sleep_key", { key_id: keyIds[0] })).status, 400);
      assert.equal((await action("resume_key", { key_id: keyIds[0] })).status, 400);
      assert.deepEqual(await keys(), before);
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 3);
      await updateKey({ manual_sleep_until: null });
    });
    await t.test("失败测试只返回事实，不改健康；成功复测才恢复失效", async () => {
      const before = await keys();
      const response = await action("test_key_model", { key_id: keyIds[0], model_id: modelA });
      assert.equal(response.status, 200); const body = await response.json();
      assert.equal(body.testResult.ok, false); assert.equal(body.testResult.failureDiagnostic.owner, "provider");
      assert.equal(body.testResult.failureDiagnostic.technical.requestId, "local-governance-probe");
      assert.deepEqual(await keys(), before);
      const oldFailure = new Date(Date.now() - 25 * 3600_000).toISOString();
      await updateKey({ consecutive_failures: 1, first_failure_at: oldFailure, last_failure_at: oldFailure, unhealthy_until: new Date(Date.now() - 1000).toISOString(), invalidated_at: null });
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 3, "单次旧故障且没有新失败证据不判永久失效");
      await updateKey({ consecutive_failures: 8, last_failure_at: new Date().toISOString(), unhealthy_until: new Date(Date.now() + 60_000).toISOString() });
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 2, "有新失败证据时按冷却暂歇");
      await updateKey({ unhealthy_until: new Date(Date.now() - 1000).toISOString() });
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 3, "冷却过期后不因旧首败时间自动判死");
      upstreamStatus = 200;
      assert.equal((await action("test_key_model", { key_id: keyIds[0], model_id: modelA })).status, 200);
      const restored = (await keys()).find((k) => k.id === keyIds[0])!;
      assert.equal(restored.first_failure_at, null); assert.equal(restored.invalidated_at, null); assert.equal(restored.consecutive_failures, 0);
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 3);
    });
    await t.test("供应级故障记录按1/5/30/60分钟冷却递增且封顶", async () => {
      const cooldowns: number[] = [];
      const supplyId = (await ordered(modelA))[0].id;
      for (let count = 1; count <= 5; count++) {
        assert.equal((await db.rpc("record_ai_supply_failure", {
          supply_id: supplyId, failure_scope: "model", failure_kind: "timeout", permanent_failure: false,
          error_message: "local fixture", window_seconds: 600, distinct_models: 3, pause_seconds: 300,
        })).error, null);
        const result = await db.from("ai_provider_key_models").select("consecutive_failures, last_failure_at, unhealthy_until").eq("id", supplyId).single();
        assert.equal(result.error, null);
        const row = result.data;
        assert.equal(row.consecutive_failures, count);
        cooldowns.push(Math.round((Date.parse(row.unhealthy_until) - Date.parse(row.last_failure_at)) / 60_000));
      }
      assert.deepEqual(cooldowns, [1, 5, 30, 60, 60]);
    });
    await t.test("休眠渠道不能充当删除最后在岗渠道的备用", async () => {
      assert.equal((await db.from("ai_feature_bindings").upsert([
        { feature_key: featureKey, label: "验收业务", model_id: modelA, is_enabled: true, lifecycle_state: "active" },
        { feature_key: "default", label: "全局默认", model_id: modelA, is_enabled: true, lifecycle_state: "active" },
      ], {onConflict:"feature_key"})).error, null);
      assert.equal((await db.from("ai_provider_keys").update({ unhealthy_until: new Date(Date.now() + 60_000).toISOString() }).eq("id", keyIds[1])).error, null);
      const response = await buildAiConfigResponse(new NextRequest("http://localhost/api/admin/ai-config", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", entity: "key", data: { id: keyIds[2] } }),
      }), actor);
      assert.equal(response.status, 409);
      const impact = await response.json();
      assert.equal(impact.requiresConfirmation,true);
      assert.ok(impact.affectedBusinesses.some((item: { key: string })=>item.key===featureKey));
      assert.equal((await keys()).length, 3);
    });
    await t.test("收走最后在岗模型渠道被阻止，审计失败恢复完整顺位与健康记录", async () => {
      const live = (await ordered(modelA)).find((r) => r.key_id === keyIds[2])!;
      const blocked = await action("remove_key_model", { key_model_id: live.id });
      assert.equal(blocked.status, 409);
      const impact = await blocked.json();
      assert.equal(impact.requiresConfirmation,true);
      assert.ok(impact.affectedBusinesses.some((item: { key: string })=>item.key===featureKey));
      const target = (await ordered(modelB))[0];
      assert.equal((await db.from("ai_provider_key_models").update({ consecutive_failures: 4, first_failure_at: new Date(Date.now() - 9000).toISOString(), invalidated_at: new Date().toISOString(), last_error_message: "local fixture model failure" }).eq("id", target.id)).error, null);
      const snapshot = (await db.from("ai_provider_key_models").select("*").eq("id", target.id).single()).data;
      // The deliberately invalid actor UUID makes the real audit insert fail.
      const response = await action("remove_key_model", { key_model_id: target.id });
      assert.equal(response.status, 500);
      const restored = (await db.from("ai_provider_key_models").select("*").eq("id", target.id).single()).data;
      assert.deepEqual(restored, snapshot);
    });

  } finally {
    assert.equal((await db.from("ai_feature_bindings").delete().in("feature_key",[featureKey,"default"])).error, null);
    if(previousBindings.data?.length) assert.equal((await db.from("ai_feature_bindings").upsert(previousBindings.data,{onConflict:"feature_key"})).error,null);
    assert.equal((await db.from("ai_providers").delete().eq("id", providerId)).error, null);
    assert.equal((await db.from("ai_provider_keys").select("id").in("id", keyIds)).data?.length, 0);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
