import assert from "node:assert/strict";
import test from "node:test";

import { __internal, AiChannelError } from "./client";
import { mapAiErrorKind } from "./call-attempt-recorder";

test("错误类型映射集中覆盖渠道错误", () => {
  assert.equal(mapAiErrorKind("timeout"), "超时");
  assert.equal(mapAiErrorKind("http_429"), "限流");
  assert.equal(mapAiErrorKind("http_402"), "额度");
  assert.equal(mapAiErrorKind("http_401"), "鉴权");
  assert.equal(mapAiErrorKind("http_404", "model_not_found"), "模型不存在");
  assert.equal(mapAiErrorKind("network"), "网络");
  assert.equal(mapAiErrorKind("http_503"), "服务端");
  assert.equal(mapAiErrorKind("content_contract_violation"), "内容不合格");
  assert.equal(mapAiErrorKind("unknown"), "其他");
});

test("每次成功尝试都写入一行调用台账", async () => {
  const rows: Array<Record<string, unknown>> = [];
  __internal.setServiceClientForTests({
    from(table: string) {
      assert.equal(table, "ai_call_attempts");
      return { insert(values: Record<string, unknown>) { rows.push(values); return Promise.resolve({ error: null }); } };
    },
  });
  try {
    const result = await __internal.sendWithFailoverForTests(
      [{ id: "supply-1", name: "first", baseUrl: "https://example.com", apiKey: "secret", model: "provider/model-a", providerKeyModelId: "supply-1", providerKeyId: "key-1", source: "provider_key_model" }],
      { messages: [], featureKey: "content_analysis" },
      false,
      async () => ({ content: "ok", model: "model-a", channelName: "first", elapsedMs: 12 }),
    );
    assert.equal(result.content, "ok");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.attempt_no, 1);
    assert.equal(rows[0]?.is_success, true);
    assert.equal(rows[0]?.feature_key, "content_analysis");
    assert.equal(rows[0]?.model_id, "model-a");
    assert.equal(rows[0]?.key_model_id, "supply-1");
    assert.equal(rows[0]?.key_id, "key-1");
    assert.equal(rows[0]?.duration_ms, 12);
    assert.equal(rows[0]?.error_kind, null);
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("失败后换渠道成功时共用 request_id，失败行标记可救回", async () => {
  const rows: Array<Record<string, unknown>> = [];
  __internal.setServiceClientForTests({
    from() {
      return { insert(values: Record<string, unknown>) { rows.push(values); return Promise.resolve({ error: null }); } };
    },
  });
  try {
    await __internal.sendWithFailoverForTests(
      [
        { id: "supply-1", name: "first", baseUrl: "https://example.com", apiKey: "secret-1", model: "model-a", providerKeyModelId: "supply-1", providerKeyId: "key-1", source: "provider_key_model" },
        { id: "supply-2", name: "second", baseUrl: "https://example.com", apiKey: "secret-2", model: "model-a", providerKeyModelId: "supply-2", providerKeyId: "key-2", source: "provider_key_model" },
      ],
      { messages: [], featureKey: "content_analysis" },
      false,
      async (channel) => {
        if (channel.id === "supply-1") throw new AiChannelError("HTTP 503", "http_503", true);
        return { content: "recovered", model: "model-a", channelName: channel.name, elapsedMs: 20 };
      },
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.is_success, false);
    assert.equal(rows[0]?.error_kind, "服务端");
    assert.equal(rows[1]?.is_success, true);
    assert.equal(rows[0]?.request_id, rows[1]?.request_id);
    assert.deepEqual([rows[0]?.attempt_no, rows[1]?.attempt_no], [1, 2]);
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("调用台账写入失败时不影响成功结果并记录警告", async () => {
  const previousWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);
  __internal.setServiceClientForTests({
    from() {
      return { insert() { return Promise.resolve({ error: { message: "台账不可用" } }); } };
    },
  });
  try {
    const result = await __internal.sendWithFailoverForTests(
      [{ name: "first", baseUrl: "https://example.com", apiKey: "secret", model: "model-a", source: "env" }],
      { messages: [] },
      true,
      async () => ({ content: "still works", model: "model-a", channelName: "first", elapsedMs: 4 }),
    );
    assert.equal(result.content, "still works");
    assert.ok(warnings.some((entry) => String(entry[0]).includes("call attempt log skipped")));
  } finally {
    console.warn = previousWarn;
    __internal.setServiceClientForTests(null);
  }
});

test("手动检测尝试记为 is_probe，不改变业务结果", async () => {
  const rows: Array<Record<string, unknown>> = [];
  __internal.setServiceClientForTests({
    from() {
      return { insert(values: Record<string, unknown>) { rows.push(values); return Promise.resolve({ error: null }); } };
    },
  });
  try {
    await __internal.sendWithFailoverForTests(
      [{ name: "probe", baseUrl: "https://example.com", apiKey: "secret", model: "model-a", source: "env" }],
      { messages: [] },
      false,
      async () => ({ content: "probe ok", model: "model-a", channelName: "probe", elapsedMs: 3 }),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.is_probe, true);
  } finally {
    __internal.setServiceClientForTests(null);
  }
});
