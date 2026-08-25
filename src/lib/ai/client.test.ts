import test from "node:test";
import assert from "node:assert/strict";

import { __internal, callAi } from "./client";

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

  maybeSingle() {
    return this.then((result) => ({ data: result.data ? [result.data].flat()[0] ?? null : null, error: null }));
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
        source: "provider_key_model",
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
        source: "provider_key_model",
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
        source: "provider_key_model",
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

test("feature config 只读 ai_feature_bindings，旧表数据不再参与", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      {
        feature_key: "content_analysis",
        provider_key_model_id: "pkm-new",
        system_prompt: "新版提示词",
        is_enabled: true,
      },
      // 旧表残留数据：即使存在也必须被忽略
    ],
    ai_feature_config: [
      {
        feature_key: "content_analysis",
        channel_id: "channel-old",
        model: "old-model",
        system_prompt: "旧版提示词",
        is_enabled: true,
      },
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("content_analysis");

    assert.equal(config?.providerKeyModelId, "pkm-new");
    assert.equal(config?.systemPrompt, "新版提示词");
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("没有 binding 时 feature config 返回 null，不再回退旧表", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [],
    ai_feature_config: [
      {
        feature_key: "content_analysis",
        channel_id: "channel-old",
        model: "legacy-model",
        system_prompt: "旧版内容分析提示词",
        is_enabled: true,
      },
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("content_analysis");

    assert.equal(config, null);
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("已删除功能即使旧表仍有配置也不能调用或掉进环境变量兜底", async () => {
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
    await assert.rejects(
      callAi({ featureKey: "video_diagnose", messages: [{ role: "user", content: "hello" }] }),
      /未注册的 AI 功能：video_diagnose/,
    );
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("未注册功能不能依赖旧表或默认渠道静默执行", async () => {
  __internal.setServiceClientForTests(createFakeService({ ai_feature_bindings: [], ai_feature_config: [] }));

  try {
    await assert.rejects(
      callAi({ featureKey: "unregistered_feature", messages: [{ role: "user", content: "hello" }] }),
      /未注册的 AI 功能：unregistered_feature/,
    );
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("正式功能被归档后会在运行时阻断，不会继续使用旧映射", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      {
        feature_key: "content_analysis",
        provider_key_model_id: "pkm-1",
        system_prompt: "旧配置仍在",
        is_enabled: false,
        lifecycle_state: "archived",
      },
    ],
    ai_feature_config: [],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    await assert.rejects(
      callAi({ featureKey: "content_analysis", messages: [{ role: "user", content: "hello" }] }),
      /该 AI 功能已归档/,
    );
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

function makePkmRow(opts: {
  id: string;
  modelId: string;
  keyPriority: number;
  keyName: string;
  providerPriority?: number;
  modelName?: string;
}) {
  return {
    id: opts.id,
    model_id: opts.modelId,
    is_enabled: true,
    key: [
      {
        id: opts.keyName,
        api_key: "sk-test",
        is_enabled: true,
        priority: opts.keyPriority,
        consecutive_failures: 0,
        unhealthy_until: null,
        provider: [
          {
            id: "prov-1",
            name: opts.modelName ?? "测试供应商",
            base_url: "https://example.com",
            priority: opts.providerPriority ?? 1,
            is_enabled: true,
          },
        ],
      },
    ],
  };
}

test("场景绑定模型后，调用链是该模型在全部渠道的顺位（同模型跨渠道切换）", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      {
        feature_key: "ocr_screenshot_structure",
        provider_key_model_id: null,
        model_id: "gemini-2.5-flash",
        system_prompt: null,
        is_enabled: true,
      },
      { feature_key: "default", provider_key_model_id: null, model_id: null, system_prompt: null, is_enabled: true },
    ],
    ai_provider_key_models: [
      makePkmRow({ id: "pkm-gemini-b", modelId: "gemini-2.5-flash", keyPriority: 9, keyName: "keyB" }),
      makePkmRow({ id: "pkm-gpt-a", modelId: "gpt-5.4-mini", keyPriority: 1, keyName: "keyA" }),
      makePkmRow({ id: "pkm-gemini-a", modelId: "gemini-2.5-flash", keyPriority: 2, keyName: "keyA" }),
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("ocr_screenshot_structure");
    const chain = await __internal.resolveFeatureChannelChainForTests(config!);

    assert.deepEqual(
      chain.map((c) => c.providerKeyModelId),
      ["pkm-gemini-a", "pkm-gemini-b"],
    );
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("场景未指定模型时，走全局默认模型的渠道顺位（最低优先级兜底）", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      {
        feature_key: "content_analysis",
        provider_key_model_id: null,
        model_id: null,
        system_prompt: null,
        is_enabled: true,
      },
      {
        feature_key: "default",
        provider_key_model_id: null,
        model_id: "gpt-5.6-luna",
        system_prompt: null,
        is_enabled: true,
      },
    ],
    ai_provider_key_models: [
      makePkmRow({ id: "pkm-luna-1", modelId: "gpt-5.6-luna", keyPriority: 1, keyName: "keyA" }),
      makePkmRow({ id: "pkm-luna-2", modelId: "gpt-5.6-luna", keyPriority: 2, keyName: "keyA" }),
      makePkmRow({ id: "pkm-mini-1", modelId: "gpt-5.4-mini", keyPriority: 1, keyName: "keyA" }),
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("content_analysis");
    const chain = await __internal.resolveFeatureChannelChainForTests(config!);

    assert.deepEqual(
      chain.map((c) => c.providerKeyModelId),
      ["pkm-luna-1", "pkm-luna-2"],
    );
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("旧组合绑定兼容：从组合推导模型后同样展开为该模型的跨渠道顺位", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      {
        feature_key: "ocr_screenshot",
        provider_key_model_id: "pkm-combo-old",
        model_id: null,
        system_prompt: null,
        is_enabled: true,
      },
      { feature_key: "default", provider_key_model_id: null, model_id: null, system_prompt: null, is_enabled: true },
    ],
    ai_provider_key_models: [
      {
        id: "pkm-combo-old",
        model_id: "gemini-2.5-flash",
        is_enabled: true,
        key: [
          {
            id: "keyC",
            api_key: "sk-test",
            is_enabled: true,
            priority: 5,
            consecutive_failures: 0,
            unhealthy_until: null,
            provider: [
              { id: "prov-1", name: "api7", base_url: "https://example.com", priority: 1, is_enabled: true },
            ],
          },
        ],
      },
      makePkmRow({ id: "pkm-gemini-fast", modelId: "gemini-2.5-flash", keyPriority: 3, keyName: "keyD" }),
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("ocr_screenshot");
    const chain = await __internal.resolveFeatureChannelChainForTests(config!);

    assert.equal(chain.every((c) => c.model === "gemini-2.5-flash"), true);
    assert.equal(chain.length, 2);
  } finally {
    __internal.setServiceClientForTests(null);
  }
});
