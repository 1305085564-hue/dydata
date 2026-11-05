import test from "node:test";
import assert from "node:assert/strict";

import { __internal, AiChannelError } from "./client";

import { createFakeService, makePkmRow, type FakeDb } from "./client-test-fixtures";

test("同次调用先尝试所选模型的全部渠道，再尝试默认模型的全部渠道", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      {
        feature_key: "ocr_screenshot_structure",
        provider_key_model_id: null,
        model_id: "gemini-2.5-flash",
        system_prompt: null,
        is_enabled: true,
      },
      { feature_key: "default", provider_key_model_id: null, model_id: "gpt-5.6-luna", system_prompt: null, is_enabled: true },
    ],
    ai_provider_key_models: [
      makePkmRow({ id: "selected-b", modelId: "gemini-2.5-flash", keyPriority: 1, keyName: "keyB", sortOrder: 2 }),
      makePkmRow({ id: "other-model", modelId: "gpt-5.4-mini", keyPriority: 1, keyName: "keyC", sortOrder: 0 }),
      makePkmRow({ id: "default-b", modelId: "gpt-5.6-luna", keyPriority: 1, keyName: "keyD", sortOrder: 2 }),
      makePkmRow({ id: "selected-a", modelId: "gemini-2.5-flash", keyPriority: 100, keyName: "keyA", sortOrder: 1 }),
      makePkmRow({ id: "default-a", modelId: "gpt-5.6-luna", keyPriority: 100, keyName: "keyE", sortOrder: 1 }),
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("ocr_screenshot_structure");
    const chain = await __internal.resolveFeatureChannelChainForTests(config!);

    assert.deepEqual(
      chain.map((c) => c.providerKeyModelId),
      ["selected-a", "selected-b", "default-a", "default-b"],
    );
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("所选模型渠道遇到不可重试的401后，仍继续尝试完所选模型并切到默认渠道", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      { feature_key: "ocr_screenshot_structure", model_id: "selected-model", provider_key_model_id: null, system_prompt: null, is_enabled: true },
      { feature_key: "default", model_id: "default-model", provider_key_model_id: null, system_prompt: null, is_enabled: true },
    ],
    ai_provider_key_models: [
      makePkmRow({ id: "selected-a", modelId: "selected-model", keyPriority: 1, keyName: "keyA", sortOrder: 1 }),
      makePkmRow({ id: "selected-b", modelId: "selected-model", keyPriority: 2, keyName: "keyB", sortOrder: 2 }),
      makePkmRow({ id: "default-a", modelId: "default-model", keyPriority: 100, keyName: "keyC", sortOrder: 1 }),
      makePkmRow({ id: "unselected", modelId: "other-model", keyPriority: 1, keyName: "keyD" }),
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("ocr_screenshot_structure");
    const chain = await __internal.resolveFeatureChannelChainForTests(config!);
    const attempts: string[] = [];
    const result = await __internal.sendWithFailoverForTests(chain, { messages: [] }, false, async (channel) => {
      attempts.push(channel.providerKeyModelId ?? "");
      if (channel.model === "selected-model") throw new AiChannelError("HTTP 401", "http_401", false);
      return { content: "ok", model: channel.model ?? "", channelName: channel.name, elapsedMs: 1 };
    });

    assert.deepEqual(attempts, ["selected-a", "selected-b", "default-a"]);
    assert.equal(result.model, "default-model");
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("所选模型渠道遇到上游408超时后，仍继续尝试完所选模型并切到默认渠道", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      { feature_key: "ocr_screenshot_structure", model_id: "selected-model", provider_key_model_id: null, system_prompt: null, is_enabled: true },
      { feature_key: "default", model_id: "default-model", provider_key_model_id: null, system_prompt: null, is_enabled: true },
    ],
    ai_provider_key_models: [
      makePkmRow({ id: "selected-a", modelId: "selected-model", keyPriority: 1, keyName: "keyA", sortOrder: 1 }),
      makePkmRow({ id: "selected-b", modelId: "selected-model", keyPriority: 2, keyName: "keyB", sortOrder: 2 }),
      makePkmRow({ id: "default-a", modelId: "default-model", keyPriority: 100, keyName: "keyC", sortOrder: 1 }),
      makePkmRow({ id: "unselected", modelId: "other-model", keyPriority: 1, keyName: "keyD" }),
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("ocr_screenshot_structure");
    const chain = await __internal.resolveFeatureChannelChainForTests(config!);
    const attempts: string[] = [];
    const result = await __internal.sendWithFailoverForTests(chain, { messages: [] }, false, async (channel) => {
      attempts.push(channel.providerKeyModelId ?? "");
      if (channel.model === "selected-model") throw new AiChannelError("HTTP 408", "http_408", false);
      return { content: "ok", model: channel.model ?? "", channelName: channel.name, elapsedMs: 1 };
    });

    assert.deepEqual(attempts, ["selected-a", "selected-b", "default-a"]);
    assert.equal(result.model, "default-model");
  } finally {
    __internal.setServiceClientForTests(null);
  }
});

test("空 modelId 跟随全局默认，调用链不包含其他模型", async () => {
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

test("旧 provider_key_model_id 不参与解析，空 modelId 仍跟随全局默认", async () => {
  const db: FakeDb = {
    ai_feature_bindings: [
      {
        feature_key: "ocr_screenshot_structure",
        provider_key_model_id: "pkm-combo-old",
        model_id: null,
        system_prompt: null,
        is_enabled: true,
      },
      { feature_key: "default", provider_key_model_id: null, model_id: "default-model", system_prompt: null, is_enabled: true },
    ],
    ai_provider_key_models: [
      makePkmRow({ id: "pkm-combo-old", modelId: "legacy-model", keyPriority: 1, keyName: "keyC" }),
      makePkmRow({ id: "pkm-default", modelId: "default-model", keyPriority: 100, keyName: "keyD" }),
      makePkmRow({ id: "pkm-unselected", modelId: "other-model", keyPriority: 1, keyName: "keyE" }),
    ],
  };
  __internal.setServiceClientForTests(createFakeService(db));

  try {
    const config = await __internal.getFeatureConfigForTests("ocr_screenshot_structure");
    const chain = await __internal.resolveFeatureChannelChainForTests(config!);

    assert.equal(config?.providerKeyModelId, null);
    assert.equal(config?.modelId, null);
    assert.deepEqual(chain.map((channel) => channel.providerKeyModelId), ["pkm-default"]);
    assert.equal(chain[0]?.model, "default-model");
  } finally {
    __internal.setServiceClientForTests(null);
  }
});
