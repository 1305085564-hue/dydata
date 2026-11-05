import assert from "node:assert/strict";
import test from "node:test";
import { __internal, AiChannelError } from "./client";
import { createFakeService, makePkmRow, type FakeDb } from "./client-test-fixtures";
import { computeAvailability } from "@/lib/ai-config/availability";
import { AI_CONFIG_MESSAGES } from "@/lib/ai-config/presentation";

const NOW = Date.now();
function supply(id: string, modelId: string, cooldown = 0) {
  return { ...makePkmRow({ id, modelId, keyName: `key-${id}`, keyPriority: 1 }),
    ...(cooldown ? { consecutive_failures: 1, unhealthy_until: new Date(NOW + cooldown).toISOString() } : {}) };
}
async function withChain(rows: ReturnType<typeof supply>[], selected: string | null, fallback: string, run: (chain: Awaited<ReturnType<typeof __internal.resolveFeatureChannelChainForTests>>) => Promise<void>) {
  const db: FakeDb = { ai_feature_bindings: [
    { feature_key: "content_analysis", model_id: selected, is_enabled: true },
    { feature_key: "default", model_id: fallback, is_enabled: true },
  ], ai_provider_key_models: rows };
  __internal.setServiceClientForTests(createFakeService(db));
  try {
    const config = await __internal.getFeatureConfigForTests("content_analysis");
    await run(await __internal.resolveFeatureChannelChainForTests(config!));
  } finally { __internal.setServiceClientForTests(null); }
}

test("第14条：所选能用→默认能用→双方歇着的，冷却截止早的先试；排除关闭、失效和其他模型", async () => {
  const invalid = { ...supply("invalid", "selected", 1000), invalidated_at: new Date(NOW).toISOString() };
  const disabled = { ...supply("disabled", "default", 1000), is_enabled: false };
  const invalidKey = supply("invalid-key", "default", 1000); invalidKey.key[0].is_enabled = false;
  await withChain([
    supply("selected-sleep", "selected", 120_000), supply("default-active", "default"),
    supply("selected-active", "selected"), supply("default-sleep", "default", 60_000),
    supply("unrelated", "other", 1000), invalid, disabled, invalidKey,
  ], "selected", "default", async chain => {
    assert.deepEqual(chain.map(c => c.id), ["selected-active", "default-active", "default-sleep", "selected-sleep"]);
    assert.equal(chain[2].requiresProbe, true);
    const attempts: string[] = [];
    const result = await __internal.sendWithFailoverForTests(chain, { messages: [] }, false, async channel => {
      attempts.push(channel.id!);
      if (channel.id !== "selected-sleep") throw new AiChannelError("timeout", "timeout", true);
      return { content: "recovered", model: channel.model!, channelName: channel.name, elapsedMs: 1 };
    });
    assert.deepEqual(attempts, chain.map(c => c.id));
    assert.equal(result.content, "recovered");
  });
});

test("默认能用就返回，不提前试所选歇着供应；默认和所选相同不重复尝试", async () => {
  await withChain([supply("sleep", "selected", 60_000), supply("healthy", "default")], "selected", "default", async chain => {
    const attempts: string[] = [];
    await __internal.sendWithFailoverForTests(chain, { messages: [] }, false, async channel => {
      attempts.push(channel.id!);
      return { content: "ok", model: channel.model!, channelName: channel.name, elapsedMs: 1 };
    });
    assert.deepEqual(attempts, ["healthy"]);
  });
  for (const selected of ["default", null]) {
    await withChain([supply("only-sleep", "default", 60_000)], selected, "default", async chain => {
      assert.deepEqual(chain.map(c => c.id), ["only-sleep"]);
      const result = await __internal.sendWithFailoverForTests(chain, { messages: [] }, false, async channel =>
        ({ content: "ok", model: channel.model!, channelName: channel.name, elapsedMs: 1 }));
      assert.equal(result.content, "ok");
    });
  }
});

test("冷却已到期仍先半开恢复；双方补试全失败明确报错，不挑第三模型", async () => {
  const due = supply("due", "selected", -1000);
  await withChain([supply("healthy", "selected"), due], "selected", "default", async chain => {
    assert.equal(chain[0].id, "due");
  });
  await withChain([supply("sleep", "selected", 60_000), supply("third", "third")], "selected", "default", async chain => {
    await assert.rejects(__internal.sendWithFailoverForTests(chain, { messages: [] }, false, async () => {
      throw new AiChannelError("temporary", "http_503", true);
    }), /所有 AI 渠道不可用/);
    assert.deepEqual(chain.map(c => c.id), ["sleep"]);
  });
});

test("歇着的供应不计能用，仍停摆；只有所选或默认还可自动重试时用新文案", () => {
  const input = {
    providers: [{ id: "p", name: "p", is_enabled: true }],
    keys: [{ id: "k", provider_id: "p", is_enabled: true }],
    models: [{ id: "m", key_id: "k", model_id: "selected", is_enabled: true,
      consecutive_failures: 1, unhealthy_until: new Date(NOW + 60_000).toISOString() }],
    featureControls: [{ key: "content_analysis", label: "分析", group: "business", lifecycleState: "active", isEnabled: true, modelId: "selected" }],
    defaultBinding: { feature_key: "default", model_id: "default" },
  };
  const report = computeAvailability(input, { now: NOW });
  assert.equal(report.modelFamilies[0].schedulableChannelCount, 0);
  assert.equal(report.businessSummary.outage, 1);
  assert.equal(report.businessAssurances[0].routingStatus, "outage");
  assert.equal(report.businessAssurances[0].preferredModelId, null);
  assert.equal(report.businessAssurances[0].messageKey, "business.outage_retrying");
  assert.equal(AI_CONFIG_MESSAGES["business.outage_retrying"], "停摆：无可用模型，系统仍在自动重试");
  for (const patch of [{ invalidated_at: new Date(NOW).toISOString() }, { is_enabled: false }, { model_id: "unrelated" }]) {
    const changed = computeAvailability({ ...input, models: [{ ...input.models[0], ...patch }] }, { now: NOW });
    assert.equal(changed.businessAssurances[0].messageKey, "business.outage");
  }
  const defaultSleeping = computeAvailability({ ...input, models: [{ ...input.models[0], model_id: "default" }] }, { now: NOW });
  assert.equal(defaultSleeping.businessAssurances[0].messageKey, "business.outage_retrying");
});
