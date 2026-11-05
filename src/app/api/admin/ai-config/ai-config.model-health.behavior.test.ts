import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAiConfigResponse } from "./route";
import { syncModelsForKey } from "./sync-models/route";
import { actor, configTables, request, type Row } from "./ai-config.behavior.fixture";

test("B8 check_all_in_use 只测已启用业务与默认的开启供应，包含休眠和失效", async () => {
  const sleepUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  const invalidSince = new Date().toISOString();
  const db = configTables({
    ai_providers: [
      { id: "provider-1", name: "Provider 1", base_url: "https://provider.test", priority: 1, is_enabled: true },
      { id: "provider-off", name: "Provider Off", base_url: "https://off.test", priority: 2, is_enabled: false },
    ],
    ai_provider_keys: [
      { id: "key-invalid", provider_id: "provider-1", label: "失效但开启", api_key: "invalid-secret", priority: 1, is_enabled: true, consecutive_failures: 3, invalidated_at: invalidSince },
      { id: "key-sleeping", provider_id: "provider-1", label: "休眠但开启", api_key: "sleep-secret", priority: 2, is_enabled: true, manual_sleep_until: sleepUntil },
      { id: "key-disabled", provider_id: "provider-1", label: "手动停用", api_key: "disabled-secret", priority: 3, is_enabled: false },
      { id: "key-provider-disabled", provider_id: "provider-off", label: "接入点停用", api_key: "provider-off-secret", priority: 4, is_enabled: true },
    ],
    ai_provider_key_models: [
      { id: "selected-invalid", key_id: "key-invalid", model_id: "selected-model", is_enabled: true, invalidated_at: invalidSince, consecutive_failures: 5, last_error_message: "old model failure" },
      { id: "default-sleeping", key_id: "key-sleeping", model_id: "default-model", is_enabled: true, unhealthy_until: sleepUntil },
      { id: "selected-disabled-key", key_id: "key-disabled", model_id: "selected-model", is_enabled: true },
      { id: "default-disabled-provider", key_id: "key-provider-disabled", model_id: "default-model", is_enabled: true },
      { id: "model-off", key_id: "key-invalid", model_id: "selected-model", is_enabled: false },
      { id: "not-selected", key_id: "key-invalid", model_id: "other-model", is_enabled: true, consecutive_failures: 4, last_error_message: "sibling failure" },
      { id: "disabled-feature-model", key_id: "key-invalid", model_id: "paused-model", is_enabled: true },
    ],
    ai_feature_bindings: [
      { id: "default-binding", feature_key: "default", label: "默认模型", model_id: "default-model", is_enabled: true, lifecycle_state: "active" },
      { id: "selected-binding", feature_key: "content_analysis", label: "内容分析", model_id: "selected-model", is_enabled: true, lifecycle_state: "active" },
      { id: "paused-binding", feature_key: "video_tag", label: "已关闭功能", model_id: "paused-model", is_enabled: false, lifecycle_state: "active" },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    return payload.model === "selected-model"
      ? new Response("model_not_found", { status: 404 })
      : new Response("ok", { status: 200 });
  };

  try {
    const response = await buildAiConfigResponse(request({ action: "check_all_in_use" }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.checkResult.total, 2);
    assert.equal(body.checkResult.successCount, 1);
    assert.equal(body.checkResult.failureCount, 1);
    assert.deepEqual(body.checkResult.results.map((result: Row) => ({
      keyId: result.keyId, modelId: result.modelId, ok: result.ok, latencyMs: result.latencyMs === null,
      message: result.message,
      diagnosticCategory: result.failureDiagnostic ? String((result.failureDiagnostic as { category?: string }).category ?? "") : null,
      diagnosticOwner: result.failureDiagnostic ? String((result.failureDiagnostic as { owner?: string }).owner ?? "") : null,
    })), [
      { keyId: "key-invalid", modelId: "selected-model", ok: false, latencyMs: true, message: "HTTP 404: model_not_found", diagnosticCategory: "model_access", diagnosticOwner: "provider" },
      { keyId: "key-sleeping", modelId: "default-model", ok: true, latencyMs: false, message: null, diagnosticCategory: null, diagnosticOwner: null },
    ]);
    assert.equal(typeof body.checkResult.results[1].latencyMs, "number");
    assert.ok(body.availability);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "selected-invalid")?.invalidated_at, invalidSince);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "selected-invalid")?.consecutive_failures, 5);
    assert.equal(db.tables.ai_provider_keys.find((row) => row.id === "key-invalid")?.consecutive_failures, 3);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "default-sleeping")?.consecutive_failures ?? 0, 0);
    assert.equal(db.tables.ai_provider_keys.find((row) => row.id === "key-sleeping")?.manual_sleep_until, null);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "not-selected")?.consecutive_failures, 4);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("B9 成功测试只恢复对应Key和实测模型，不清兄弟模型故障", async () => {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const sleepUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  const db = configTables({
    ai_provider_keys: [{
      id: "key-1",
      provider_id: "provider-1",
      label: "测试 Key",
      api_key: "model-secret",
      priority: 1,
      is_enabled: true,
      consecutive_failures: 4,
      first_failure_at: stale,
      last_failure_at: stale,
      unhealthy_until: sleepUntil,
      manual_sleep_until: sleepUntil,
    }],
    ai_provider_key_models: [
      { id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true, consecutive_failures: 5, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, invalidated_at: stale, last_error_message: "current model failure", last_failure_scope: "model" },
      { id: "sibling-row", key_id: "key-1", model_id: "model-b", is_enabled: true, consecutive_failures: 3, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, invalidated_at: stale, last_error_message: "sibling model failure", last_failure_scope: "model" },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("ok", { status: 200 });

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_model",
      data: { key_id: "key-1", model_id: "model-a" },
    }), actor(db));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.testResult.ok, true);
    assert.equal(body.testResult.errorScope, null);
    const tested = db.tables.ai_provider_key_models.find((row) => row.id === "model-row");
    const sibling = db.tables.ai_provider_key_models.find((row) => row.id === "sibling-row");
    assert.equal(tested?.last_success_at !== undefined, true);
    assert.equal(tested?.consecutive_failures, 0);
    assert.equal(tested?.first_failure_at, null);
    assert.equal(tested?.unhealthy_until, null);
    assert.equal(tested?.invalidated_at, null);
    assert.equal(db.tables.ai_provider_keys[0].last_success_at !== undefined, true);
    assert.equal(db.tables.ai_provider_keys[0].consecutive_failures, 0);
    assert.equal(db.tables.ai_provider_keys[0].manual_sleep_until, null);
    assert.equal(sibling?.consecutive_failures, 3);
    assert.equal(sibling?.first_failure_at, stale);
    assert.equal(sibling?.invalidated_at, stale);
    assert.equal(sibling?.last_error_message, "sibling model failure");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("截图功能试跑失败不改健康；成功只恢复实际返回的Key与供应", async () => {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const sleepUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "测试 Key", api_key: "secret", priority: 1, is_enabled: true, consecutive_failures: 4, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, manual_sleep_until: sleepUntil }],
    ai_provider_key_models: [
      { id: "tested-row", key_id: "key-1", model_id: "haiku-model", is_enabled: true, consecutive_failures: 5, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, invalidated_at: stale, last_error_message: "tested model failure" },
      { id: "sibling-row", key_id: "key-1", model_id: "sibling-model", is_enabled: true, consecutive_failures: 3, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, invalidated_at: stale, last_error_message: "sibling model failure" },
    ],
  });
  let failProbe = true;
  const deps = {
    requireSystemActor: actor(db).requireSystemActor,
    probeAiFeature: async (_feature: string, options: { validateContent?: (content: string) => boolean }) => {
      assert.equal(options.validateContent?.('{"color":"black"}'), true);
      assert.equal(options.validateContent?.('{"color":"white"}'), false);
      if (failProbe) throw new Error("图片识别验证失败：没有识别出黑色测试像素");
      return { content: '{"color":"black"}', model: "haiku-model", channelName: "测试渠道", providerKeyId: "key-1", providerKeyModelId: "tested-row", elapsedMs: 5 };
    },
  };
  const request = () => new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "test_key", data: { feature_key: "ocr_screenshot" } }),
  });

  const before = JSON.stringify(db.tables);
  const failed = await buildAiConfigResponse(request(), deps);
  assert.equal((await failed.json()).testResult.ok, false);
  assert.equal(JSON.stringify(db.tables), before);

  failProbe = false;
  const success = await buildAiConfigResponse(request(), deps);
  assert.equal((await success.json()).testResult.ok, true);
  assert.equal(db.tables.ai_provider_keys[0].consecutive_failures, 0);
  assert.equal(db.tables.ai_provider_keys[0].manual_sleep_until, null);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "tested-row")?.consecutive_failures, 0);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "tested-row")?.invalidated_at, null);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "sibling-row")?.consecutive_failures, 3);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "sibling-row")?.invalidated_at, stale);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "sibling-row")?.last_error_message, "sibling model failure");
});

test("Haiku 5.5 看图探测走原生 Messages API，并校验识别正文", async () => {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const db = configTables({
    ai_provider_key_models: [{ id: "haiku-row", key_id: "key-1", model_id: "claude-haiku-5-5", is_enabled: true, consecutive_failures: 3, first_failure_at: stale, last_failure_at: stale, invalidated_at: stale }],
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "Haiku", api_key: "haiku-secret", priority: 1, is_enabled: true, consecutive_failures: 3, first_failure_at: stale, last_failure_at: stale, manual_sleep_until: new Date(Date.now() + 60_000).toISOString() }],
  });
  const previousFetch = globalThis.fetch;
  let responseText = '{"color":"black"}';
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://provider.test/messages");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-api-key"), "haiku-secret");
    assert.equal(headers.get("anthropic-version"), "2023-06-01");
    assert.equal(headers.get("authorization"), null);
    const payload = JSON.parse(String(init?.body ?? "{}")) as { messages: Array<{ content: Array<{ source?: { type?: string; media_type?: string } }> }>; stream?: boolean };
    assert.equal(payload.stream, false);
    assert.equal(payload.messages[0].content[1].source?.type, "base64");
    assert.equal(payload.messages[0].content[1].source?.media_type, "image/png");
    return Response.json({ model: "claude-haiku-5-5", content: [{ type: "text", text: responseText }], usage: { input_tokens: 10, output_tokens: 3 } });
  };

  const runProbe = () => buildAiConfigResponse(request({
    action: "test_key",
    data: { key_id: "key-1", model_id: "claude-haiku-5-5", test_mode: "vision" },
  }), actor(db));

  try {
    const passed = await runProbe();
    assert.equal((await passed.json()).testResult.ok, true);
    assert.equal(db.tables.ai_provider_key_models[0].consecutive_failures, 0);
    assert.equal(db.tables.ai_provider_key_models[0].invalidated_at, null);
    assert.equal(db.tables.ai_provider_keys[0].manual_sleep_until, null);

    db.tables.ai_provider_key_models[0].consecutive_failures = 2;
    db.tables.ai_provider_key_models[0].invalidated_at = stale;
    db.tables.ai_provider_key_models[0].last_error_message = "retain on failed probe";
    const modelSnapshot = { ...db.tables.ai_provider_key_models[0] };
    const keySnapshot = { ...db.tables.ai_provider_keys[0] };
    responseText = '{"color":"white"}';
    const failed = await runProbe();
    const body = await failed.json();
    assert.equal(body.testResult.ok, false);
    assert.match(body.testResult.message, /没有识别出黑色测试像素/);
    assert.ok(body.testResult.failureDiagnostic);
    assert.deepEqual(db.tables.ai_provider_key_models[0], modelSnapshot);
    assert.deepEqual(db.tables.ai_provider_keys[0], keySnapshot);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("B10 test_key_model 的模型错误只写当前模型，且错误响应不泄露 API Key", async () => {
  const db = configTables({
    ai_provider_keys: [{
      id: "key-1",
      provider_id: "provider-1",
      label: "测试 Key",
      api_key: "model-secret",
      priority: 1,
      is_enabled: true,
      consecutive_failures: 0,
    }],
    ai_provider_key_models: [{
      id: "model-row",
      key_id: "key-1",
      model_id: "model-a",
      is_enabled: true,
      consecutive_failures: 0,
    }],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: `model_not_found; Bearer model-secret` }),
    { status: 404 },
  );

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_model",
      data: { key_id: "key-1", model_id: "model-a" },
    }), actor(db));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.testResult.ok, false);
    assert.equal(body.testResult.errorScope, "model");
    assert.match(body.testResult.message, /model_not_found/);
    assert.equal(body.testResult.message.includes("model-secret"), false);
    assert.equal(db.tables.ai_provider_key_models[0].consecutive_failures ?? 0, 0);
    assert.equal(db.tables.ai_provider_keys[0].consecutive_failures ?? 0, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

/**
 * 复现 2026-10-10 的伪修复：ae86a6cb 只删了外层 is_enabled 过滤，
 * 内层 handleTestKeyModel 仍拒绝未勾选与已全站下架的模型，
 * 结果这些模型不是被真测，而是被兜成「该渠道未挂载此模型」的假失败。
 */
test("B11 检测范围含未勾选与已全站下架模型：不得出现假失败，测通必须洗白模型状态", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "row-live", key_id: "key-1", model_id: "model-live", is_enabled: true },
      { id: "row-draft", key_id: "key-1", model_id: "model-draft", is_enabled: false },
      { id: "row-unshelved", key_id: "key-1", model_id: "model-unshelved", is_enabled: true, global_is_enabled: false },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("ok", { status: 200 });

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 3, "三个挂载模型都应进入检测");
    assert.equal(body.successCount, 3, "上游全部返回 200，不应有失败");
    assert.equal(body.failureCount, 0);
    assert.deepEqual(body.failedModelIds, []);
    assert.equal(
      db.tables.ai_provider_key_models.filter((row) => row.last_success_at !== undefined).length,
      3,
      "测通后三条模型记录都要被洗白",
    );
    assert.equal(db.tables.ai_provider_keys[0].consecutive_failures, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("test_key_all_models 会检测当前渠道全部挂载模型并返回失败原因", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "model-good-row", key_id: "key-1", model_id: "model-good", is_enabled: true },
      { id: "model-fail-row", key_id: "key-1", model_id: "model-fail", is_enabled: true },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    return payload.model === "model-fail"
      ? new Response("model unavailable", { status: 400 })
      : new Response("ok", { status: 200 });
  };

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.keyId, "key-1");
    assert.equal(body.total, 2);
    assert.equal(body.successCount, 1);
    assert.equal(body.failureCount, 1);
    assert.deepEqual(body.failedModelIds, ["model-fail"]);
    assert.deepEqual(body.results.map((result: Record<string, unknown>) => ({
      modelId: result.modelId,
      ok: result.ok,
      error: result.error,
    })), [
      { modelId: "model-good", ok: true, error: null },
      { modelId: "model-fail", ok: false, error: "HTTP 400: model unavailable" },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("test_all_keys 与 test_all_keys_all_models 兼容别名返回同一 checkResult", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "default-row", key_id: "key-1", model_id: "default-model", is_enabled: true }],
    ai_feature_bindings: [{ id: "default-binding", feature_key: "default", label: "全局默认", model_id: "default-model", is_enabled: true, lifecycle_state: "active" }],
  });
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return new Response("ok", { status: 200 }); };

  try {
    for (const action of ["test_all_keys", "test_all_keys_all_models"]) {
      const response = await buildAiConfigResponse(request({ action }), actor(db));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body.checkResult.results.map((result: Row) => ({ keyId: result.keyId, modelId: result.modelId, ok: result.ok, message: result.message })), [
        { keyId: "key-1", modelId: "default-model", ok: true, message: null },
      ]);
      assert.equal(body.checkResult.total, 1);
      assert.ok(body.availability);
    }
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("批量模型检测使用有限并发而不是逐个串行等待", async () => {
  const db = configTables({
    ai_provider_key_models: Array.from({ length: 8 }, (_, index) => ({
      id: `model-row-${index}`,
      key_id: "key-1",
      model_id: `model-${index}`,
      is_enabled: true,
    })),
  });
  const previousFetch = globalThis.fetch;
  let activeRequests = 0;
  let maxActiveRequests = 0;
  globalThis.fetch = async () => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 15));
    activeRequests -= 1;
    return new Response("ok", { status: 200 });
  };

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.total, 8);
    assert.ok(maxActiveRequests >= 2, `expected concurrent probes, saw ${maxActiveRequests}`);
    assert.ok(maxActiveRequests <= 4, `expected a concurrency cap, saw ${maxActiveRequests}`);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("模型探测超时返回 15 秒判定线与可读中文原因，不泄露英文 AbortError", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "model-slow-row", key_id: "key-1", model_id: "model-slow", is_enabled: true },
    ],
  });
  const previousFetch = globalThis.fetch;
  const timeoutError = new Error("The operation was aborted due to timeout");
  timeoutError.name = "TimeoutError";
  globalThis.fetch = async () => {
    throw timeoutError;
  };

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.successCount, 0);
    assert.equal(body.failureCount, 1);
    assert.deepEqual(body.results, [{
      modelId: "model-slow",
      ok: false,
      latencyMs: null,
      error: "上游 15 秒内没有返回任何响应（超时）",
      failureDiagnostic: { category: "provider", owner: "provider", technical: { message: "上游 15 秒内没有返回任何响应（超时）", status: null, requestId: null } },
    }]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("单模型测试与批量检测共用同一条 15 秒判定线与同一句失败原因", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "model-slow-row", key_id: "key-1", model_id: "model-slow", is_enabled: true },
    ],
  });
  const previousFetch = globalThis.fetch;
  const timeoutError = new Error("The operation was aborted due to timeout");
  timeoutError.name = "TimeoutError";
  globalThis.fetch = async () => {
    throw timeoutError;
  };

  try {
    const single = await buildAiConfigResponse(request({
      action: "test_key_model",
      data: { key_id: "key-1", model_id: "model-slow" },
    }), actor(db));
    const singleBody = await single.json();

    const batch = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const batchBody = await batch.json();

    assert.equal(singleBody.testResult.ok, false);
    assert.equal(singleBody.testResult.message, "上游 15 秒内没有返回任何响应（超时）");
    // 同一个模型、同一时刻的判定结果与原因必须与批量一致
    assert.equal(batchBody.results[0].ok, singleBody.testResult.ok);
    assert.equal(batchBody.results[0].error, singleBody.testResult.message);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("C1 上游清单为空不替代真实业务依赖；无业务受影响可关闭", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "channel", api_key: "secret", is_enabled: true, available_models: [] }],
    ai_provider_key_models: [{ id: "row", key_id: "key-1", model_id: "model-a", is_enabled: true }],
  });
  const response = await buildAiConfigResponse(request({ action: "update", entity: "key", data: { id: "key-1", is_enabled: false } }), actor(db));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_keys[0].is_enabled, false);
  assert.equal(db.tables.ai_provider_key_models[0].is_enabled, true);
});

test("C1 现有供应可重新打开，不因上游清单未知增加第二套开关规则", async () => {
  const db = configTables({ ai_provider_key_models: [{ id: "row", key_id: "key-1", model_id: "model-a", is_enabled: false }] });
  const response = await buildAiConfigResponse(request({ action: "set_key_model_selection", data: { key_id: "key-1", model_ids: ["model-a"] } }), actor(db));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_key_models[0].is_enabled, true);
});

test("C2 批量停用恢复只恢复原来打开的供应", async () => {
  const db = configTables({ ai_provider_key_models: [
    { id: "on", key_id: "key-1", model_id: "model-a", is_enabled: true, disabled_by_model: false },
    { id: "off", key_id: "key-1", model_id: "model-a", is_enabled: false, disabled_by_model: false },
  ] });
  for (const isEnabled of [false, true]) {
    const response = await buildAiConfigResponse(request({ action: "set_model_enabled", data: { model_id: "model-a", is_enabled: isEnabled } }), actor(db));
    assert.equal(response.status, 200);
  }
  assert.deepEqual(db.tables.ai_provider_key_models.map(row => row.is_enabled), [true, false]);
  assert.deepEqual(db.tables.ai_provider_key_models.map(row => row.disabled_by_model), [false, false]);
});

test("C3 同一渠道连点五次检测不改变供给或健康计数", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true, global_is_enabled: true, consecutive_failures: 2 }],
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "key-1", api_key: "secret", priority: 1, is_enabled: true, consecutive_failures: 1 }],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("model unavailable", { status: 400 });
  try {
    const before = JSON.stringify(db.tables);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await buildAiConfigResponse(request({ action: "test_key_all_models", data: { key_id: "key-1" } }), actor(db));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).failureCount, 1);
    }
    assert.equal(JSON.stringify(db.tables), before);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("C4 同步后只把清单缺失且实测 404 的模型列为已核实，其余保持未知", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api tang ChatGPT", api_key: "secret", priority: 1, is_enabled: true, available_models: ["model-live"] }],
    ai_provider_key_models: [
      { id: "live-row", key_id: "key-1", model_id: "model-live", is_enabled: true },
      { id: "dead-row", key_id: "key-1", model_id: "model-dead", is_enabled: true },
      { id: "unknown-row", key_id: "key-1", model_id: "model-unknown", is_enabled: true },
    ],
  });
  const result = await syncModelsForKey(db as never, { keyId: "key-1", modelIds: ["model-live"] }, async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    if (body.model === "model-dead") return new Response("model_not_found", { status: 404 });
    return new Response("upstream unavailable", { status: 500 });
  });
  assert.deepEqual(result.reconciliation.verifiedUnavailableModelIds, ["model-dead"]);
  assert.deepEqual(result.reconciliation.unknownModelIds, ["model-unknown"]);
  assert.equal(result.reconciliation.status, "unknown");
  assert.deepEqual(db.tables.ai_provider_key_models.filter((row) => row.key_id === "key-1").map((row) => row.model_id), ["model-live", "model-dead", "model-unknown"]);
});

test("C-R2 单渠道幽灵比对并发上限为 4 且仍逐条完成", async () => {
  const staleModels = Array.from({ length: 21 }, (_, index) => ({
    id: `stale-row-${index}`,
    key_id: "key-1",
    model_id: `stale-model-${index}`,
    is_enabled: true,
  }));
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api1 default", api_key: "secret", priority: 1, is_enabled: true }],
    ai_provider_key_models: staleModels,
  });
  let activeRequests = 0;
  let maxActiveRequests = 0;
  let requestCount = 0;
  const fetcher = async () => {
    requestCount += 1;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 10));
    activeRequests -= 1;
    return new Response("model_not_found", { status: 404 });
  };

  const result = await syncModelsForKey(db as never, { keyId: "key-1", modelIds: ["live-model"] }, fetcher);
  assert.equal(requestCount, 21);
  assert.ok(maxActiveRequests >= 2, `expected concurrent probes, saw ${maxActiveRequests}`);
  assert.ok(maxActiveRequests <= 4, `expected a concurrency cap of 4, saw ${maxActiveRequests}`);
  assert.equal(result.reconciliation.verifiedUnavailableModelIds.length, 21);
});

test("C6 收走渠道模型成功后写入操作人、对象和来源审计", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api tang ChatGPT", api_key: "secret", priority: 1, is_enabled: true, available_models: ["model-a"] }],
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", display_name: "模型 A", is_enabled: false, global_is_enabled: true }],
  });
  const response = await buildAiConfigResponse(request({ action: "delete", entity: "model", data: { id: "model-row" } }), actor(db));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_key_models.length, 0);
  assert.equal(db.tables.audit_logs.length, 1);
  assert.equal(db.tables.audit_logs[0].user_id, "admin-1");
  assert.equal(db.tables.audit_logs[0].action, "ai_provider_model_remove");
  assert.match(String(db.tables.audit_logs[0].detail), /admin_ai_config/);
  assert.deepEqual(db.rpcCalls[0], {
    fn: "remove_ai_config_supply_with_audit",
    args: {
      p_supply_id: "model-row",
      p_actor_id: "admin-1",
      p_audit_detail: db.tables.audit_logs[0].detail,
    },
  });
});

test("收走供应的原子审计 RPC 报错时返回已回滚并保持完整状态", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api tang ChatGPT", api_key: "secret", priority: 1, is_enabled: true, available_models: ["model-a"] }],
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", display_name: "模型 A", is_enabled: false }],
  }, { failRpc: "remove_ai_config_supply_with_audit" });
  const before = structuredClone(db.tables);

  const response = await buildAiConfigResponse(request({ action: "delete", entity: "model", data: { id: "model-row" } }), actor(db));

  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "收走模型失败：审计写入失败，已回滚");
  assert.deepEqual(db.tables, before);
  assert.equal(db.rpcCalls[0]?.fn, "remove_ai_config_supply_with_audit");
});

test("C8 没有正在使用的可检测供应时 checkResult 返回 0/0", async () => {
  const db = configTables();
  const response = await buildAiConfigResponse(request({ action: "check_all_in_use" }), actor(db));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.checkResult, { total: 0, successCount: 0, failureCount: 0, results: [] });
  assert.ok(body.availability);
});
