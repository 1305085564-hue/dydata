import test from "node:test";
import assert from "node:assert/strict";

import { __internal } from "./client";

type Row = Record<string, unknown>;
type FakeDb = Record<string, Row[]>;

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const rows = (this.db[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }
}

function createFakeService(db: FakeDb) {
  return {
    from(table: string) {
      return new FakeQuery(db, table);
    },
  };
}

test("databaseOnly 模式下 resolveModel 不读取环境变量模型", () => {
  const prevAiModel = process.env.AI_MODEL;
  process.env.AI_MODEL = "env-model";

  try {
    const model = __internal.resolveModel(
      {
        name: "ocr-channel",
        baseUrl: "https://example.com",
        apiKey: "secret",
        model: null,
        source: "database",
      },
      {
        messages: [{ role: "user", content: "hello" }],
        databaseOnly: true,
      }
    );

    assert.equal(model, "claude-sonnet-4-6");
  } finally {
    if (prevAiModel === undefined) {
      delete process.env.AI_MODEL;
    } else {
      process.env.AI_MODEL = prevAiModel;
    }
  }
});

test("普通模式下 resolveModel 仍可回落到环境变量模型", () => {
  const prevAiModel = process.env.AI_MODEL;
  process.env.AI_MODEL = "env-model";

  try {
    const model = __internal.resolveModel(
      {
        name: "default-channel",
        baseUrl: "https://example.com",
        apiKey: "secret",
        model: null,
        source: "database",
      },
      {
        messages: [{ role: "user", content: "hello" }],
      }
    );

    assert.equal(model, "env-model");
  } finally {
    if (prevAiModel === undefined) {
      delete process.env.AI_MODEL;
    } else {
      process.env.AI_MODEL = prevAiModel;
    }
  }
});

test("显式传入 model 时优先于渠道和环境变量", () => {
  const prevAiModel = process.env.AI_MODEL;
  process.env.AI_MODEL = "env-model";

  try {
    const model = __internal.resolveModel(
      {
        name: "default-channel",
        baseUrl: "https://example.com",
        apiKey: "secret",
        model: "channel-model",
        source: "database",
      },
      {
        messages: [{ role: "user", content: "hello" }],
        model: "explicit-model",
      }
    );

    assert.equal(model, "explicit-model");
  } finally {
    if (prevAiModel === undefined) {
      delete process.env.AI_MODEL;
    } else {
      process.env.AI_MODEL = prevAiModel;
    }
  }
});

test("normalizeResponseContent 支持 output_text block", () => {
  const text = __internal.normalizeResponseContent([
    { type: "output_text", text: "第一行" },
    { type: "text", text: "第二行" },
  ]);

  assert.equal(text, "第一行\n第二行");
});

test("describeMissingResponseContent 会带出 finish_reason 和 message 结构", () => {
  const message = __internal.describeMissingResponseContent({
    choices: [
      {
        finish_reason: "stop",
        native_finish_reason: "stop",
        message: {
          content: null,
          reasoning_content: null,
          tool_calls: null,
        } as unknown as {
          content?: unknown;
          text?: unknown;
          reasoning_content?: unknown;
          refusal?: unknown;
        },
      },
    ],
  });

  assert.match(message, /AI 返回空正文/);
  assert.match(message, /finish_reason=stop/);
  assert.match(message, /content_type=null/);
  assert.match(message, /message_keys=content,reasoning_content,tool_calls/);
});

test("feature config 优先读取 ai_feature_bindings 并覆盖旧 ai_feature_config", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      {
        feature_key: "growth_insight",
        provider_key_model_id: "pkm-new",
        system_prompt: "新版提示词",
        is_enabled: true,
      },
    ],
    ai_feature_config: [
      {
        feature_key: "growth_insight",
        channel_id: "channel-old",
        model: "old-model",
        system_prompt: "旧版提示词",
        is_enabled: true,
      },
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("growth_insight");

    assert.equal(config?.source, "binding");
    assert.equal(config?.providerKeyModelId, "pkm-new");
    assert.equal(config?.channelId, null);
    assert.equal(config?.model, null);
    assert.equal(config?.systemPrompt, "新版提示词");
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("feature config 在没有 binding 时回退旧 ai_feature_config", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [],
    ai_feature_config: [
      {
        feature_key: "video_diagnose",
        channel_id: "channel-old",
        model: "legacy-model",
        system_prompt: "旧版视频诊断提示词",
        is_enabled: true,
      },
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("video_diagnose");

    assert.equal(config?.source, "legacy");
    assert.equal(config?.providerKeyModelId, null);
    assert.equal(config?.channelId, "channel-old");
    assert.equal(config?.model, "legacy-model");
    assert.equal(config?.systemPrompt, "旧版视频诊断提示词");
  } finally {
    __internal.setServiceClientForTests(null);
  }
});
