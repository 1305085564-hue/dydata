import test from "node:test";
import assert from "node:assert/strict";

import type { AiChannelRow, AiFeatureItem } from "./types";
import {
  applyFeaturePatch,
  buildFeatureSavePayload,
  getFeaturePayloadKey,
  getStatus,
  isFeatureVersionCurrent,
  isRecoverable,
  mergeLoadedFeatures,
  normalizeFeatureItem,
  resolveSelectedChannelId,
} from "./utils";

function makeChannel(overrides: Partial<AiChannelRow> = {}): AiChannelRow {
  return {
    id: "channel-1",
    name: "渠道 A",
    base_url: "https://example.com/v1",
    api_key_masked: "sk-1***abcd",
    model: "gpt-5.4-mini",
    priority: 1,
    is_enabled: true,
    unhealthy_until: null,
    consecutive_failures: 0,
    last_failure_at: null,
    last_success_at: null,
    last_error_message: null,
    ...overrides,
  };
}

function makeFeature(overrides: Partial<AiFeatureItem> = {}): AiFeatureItem {
  return normalizeFeatureItem({
    id: "feature-1",
    feature_key: "growth_insight",
    label: "成长分析",
    channel_id: "channel-1",
    channel_name: "渠道 A",
    model: "gpt-5.4-mini",
    system_prompt: "原提示词",
    is_enabled: true,
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
    ...overrides,
  });
}

test("渠道状态工具函数能区分健康 / 熔断 / 禁用", () => {
  const disabledChannel = makeChannel({ is_enabled: false });
  assert.equal(getStatus(disabledChannel), "disabled");
  assert.equal(isRecoverable(disabledChannel), false);

  const circuitChannel = makeChannel({
    unhealthy_until: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(getStatus(circuitChannel), "circuit");
  assert.equal(isRecoverable(circuitChannel), true);

  const healthyChannel = makeChannel({
    unhealthy_until: new Date(Date.now() - 60_000).toISOString(),
  });
  assert.equal(getStatus(healthyChannel), "healthy");
  assert.equal(isRecoverable(healthyChannel), false);
});

test("功能保存 payload 会 trim 空值，并把空渠道/空模型/空提示词转成 null", () => {
  const payload = buildFeatureSavePayload(
    makeFeature({
      channel_id: " channel-2 ",
      model: "   ",
      system_prompt: "  只保留这句  ",
    }),
  );

  assert.deepEqual(payload, {
    id: "feature-1",
    channel_id: "channel-2",
    model: null,
    system_prompt: "只保留这句",
    is_enabled: true,
  });

  const payloadWithModel = buildFeatureSavePayload(
    makeFeature({
      channel_id: "",
      model: "  claude-3.7-sonnet  ",
      system_prompt: "   ",
    }),
  );

  assert.deepEqual(payloadWithModel, {
    id: "feature-1",
    channel_id: null,
    model: "claude-3.7-sonnet",
    system_prompt: null,
    is_enabled: true,
  });
});

test("功能补丁会独立更新渠道、模型，并允许回到自动/默认语义", () => {
  const baseFeature = makeFeature({
    channel_id: "channel-1",
    channel_name: "渠道 A",
    model: "gpt-5.4-mini",
  });

  const reassignedFeature = applyFeaturePatch(baseFeature, {
    channel_id: "channel-2",
    channel_name: "渠道 B",
    model: "claude-sonnet-4-6",
  });
  assert.equal(reassignedFeature.channel_id, "channel-2");
  assert.equal(reassignedFeature.channel_name, "渠道 B");
  assert.equal(reassignedFeature.model, "claude-sonnet-4-6");

  const resetFeature = applyFeaturePatch(reassignedFeature, {
    channel_id: "",
    channel_name: null,
    model: "",
  });
  assert.equal(resetFeature.channel_id, "");
  assert.equal(resetFeature.channel_name, null);
  assert.equal(resetFeature.model, "");
});

test("选中态解析会保留有效渠道、缺失时回退首个渠道，新增态不被刷新抢走", () => {
  const channels = [makeChannel({ id: "a", priority: 2 }), makeChannel({ id: "b", priority: 1 })];

  assert.equal(
    resolveSelectedChannelId({
      channels,
      currentSelectedChannelId: "a",
      isCreatingChannel: false,
    }),
    "a",
  );

  assert.equal(
    resolveSelectedChannelId({
      channels,
      currentSelectedChannelId: "missing",
      isCreatingChannel: false,
    }),
    "a",
  );

  assert.equal(
    resolveSelectedChannelId({
      channels,
      currentSelectedChannelId: "a",
      isCreatingChannel: true,
    }),
    null,
  );
});

test("后台刷新时会保留本地待保存功能，避免把未保存修改覆盖掉", () => {
  const localFeature = makeFeature({
    model: "gpt-4.1",
    system_prompt: "本地未保存",
  });
  const cleanFeature = makeFeature({
    id: "feature-2",
    feature_key: "admin_assistant",
    label: "后台助手",
    model: "",
    system_prompt: "",
  });

  const merged = mergeLoadedFeatures({
    loadedFeatures: [
      makeFeature({
        model: "server-model",
        system_prompt: "服务端旧值",
      }),
      cleanFeature,
    ],
    localFeatures: [localFeature, cleanFeature],
    saveStates: {
      "feature-1": "pending",
      "feature-2": "idle",
    },
    lastSaved: {
      "feature-1": getFeaturePayloadKey(
        makeFeature({
          model: "",
          system_prompt: "服务端旧值",
        }),
      ),
      "feature-2": getFeaturePayloadKey(cleanFeature),
    },
  });

  assert.equal(merged.features[0].model, "gpt-4.1");
  assert.equal(merged.features[0].system_prompt, "本地未保存");
  assert.equal(merged.features[1].id, "feature-2");
});

test("后台刷新遇到已删除渠道时，不保留前端对失效 channel_id 的脏引用", () => {
  const staleLocalFeature = makeFeature({
    channel_id: "deleted-channel",
    channel_name: "已删除渠道",
    model: "",
  });

  const merged = mergeLoadedFeatures({
    loadedFeatures: [
      makeFeature({
        channel_id: "",
        channel_name: null,
        model: "",
      }),
    ],
    localFeatures: [staleLocalFeature],
    saveStates: {
      "feature-1": "error",
    },
    lastSaved: {
      "feature-1": getFeaturePayloadKey(
        makeFeature({
          channel_id: "",
          channel_name: null,
          model: "",
        }),
      ),
    },
    validChannelIds: new Set(["channel-1", "channel-2"]),
  });

  assert.equal(merged.features[0].channel_id, "");
  assert.equal(merged.features[0].channel_name, null);
});

test("旧保存请求版本不会被当成最新结果应用", () => {
  assert.equal(isFeatureVersionCurrent(3, 3), true);
  assert.equal(isFeatureVersionCurrent(4, 3), false);
  assert.equal(isFeatureVersionCurrent(undefined, 0), true);
});
