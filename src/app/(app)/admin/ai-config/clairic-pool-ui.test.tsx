import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import type { AvailabilityModelFamily } from "@/lib/ai-config/availability";
import { isModelAllowedForFeature } from "@/lib/ai/provider-protocols";
import { buildModelFamilySelectOptions } from "./components/model-family-select";
import { OcrSpeedLogRow, type OcrSpeedLogItem } from "./components/ocr-speed-drawer";

function makeFamily(
  modelId: string,
  displayName: string,
  overrides: Partial<AvailabilityModelFamily> = {},
): AvailabilityModelFamily {
  return {
    modelId,
    displayName,
    modelScope: modelId === "clairic" ? "ocr_only" : "general",
    isShelved: true,
    channels: [],
    identityCounts: { active: 1, retest: 0, sleeping: 0, invalid: 0, disabled: 0 },
    redundancyCount: 0,
    singlePointRisk: true,
    healthyChannelCount: 1,
    untestedChannelCount: 0,
    schedulableChannelCount: 1,
    faultChannelCount: 0,
    isConfigured: true,
    isSelectable: true,
    unavailableReasonKey: null,
    ...overrides,
  };
}

function makeLogItem(overrides: Partial<OcrSpeedLogItem> = {}): OcrSpeedLogItem {
  return {
    id: "log-1",
    created_at: "2026-11-22T12:00:00.000Z",
    duration_ms: 2620,
    ocr_ms: 2620,
    download_ms: 120,
    channel_name: "CF备账号",
    model_id: "clairic",
    screenshot_type: "data",
    is_success: true,
    error_code: null,
    fallback_detail: null,
    ...overrides,
  };
}

function renderLogRow(item: OcrSpeedLogItem): string {
  return renderToStaticMarkup(
    <table>
      <tbody>
        <OcrSpeedLogRow item={item} />
      </tbody>
    </table>,
  );
}

test("ModelFamilySelect 能力隔离：Clairic 仅在截图识别可选，其他功能禁用；普通模型绝不误伤", () => {
  const families: AvailabilityModelFamily[] = [
    makeFamily("clairic", "Cloudflare Clairic", { modelScope: "ocr_only" }),
    makeFamily("claude-haiku-5-5", "Claude Haiku 5.5", { modelScope: "general" }),
    makeFamily("gemini-2.5-flash", "Gemini 2.5 Flash", { modelScope: "general" }),
    makeFamily("deepseek-chat", "DeepSeek Chat", { modelScope: "general" }),
  ];

  // 1) 截图识别：Clairic 与所有常规模型都可选，绝不对常规模型做名称正则禁选
  const ocrOptions = buildModelFamilySelectOptions(families, "ocr_screenshot");
  const ocrClairic = ocrOptions.find((o) => o.id === "clairic");
  assert.ok(ocrClairic);
  assert.equal(ocrClairic.isOcrOnly, true);
  assert.equal(ocrClairic.isSelectable, true);
  assert.equal(ocrClairic.scopeBlocked, false);
  assert.equal(ocrClairic.disabledReason, null);
  for (const generalId of ["claude-haiku-5-5", "gemini-2.5-flash", "deepseek-chat"]) {
    const opt = ocrOptions.find((o) => o.id === generalId);
    assert.ok(opt);
    assert.equal(opt.isSelectable, true);
    assert.equal(opt.scopeBlocked, false);
    assert.equal(opt.disabledReason, null);
  }

  // 2) 全局默认：Clairic 不可选且沉到可用模型后，展示统一能力限制原因。
  const defaultOptions = buildModelFamilySelectOptions(families, "default");
  const defaultClairic = defaultOptions.find((o) => o.id === "clairic");
  assert.ok(defaultClairic);
  assert.equal(defaultClairic.isSelectable, false);
  assert.equal(defaultClairic.scopeBlocked, true);
  assert.equal(defaultClairic.disabledReason, "Cloudflare Clairic 是截图专项模型，不能用作全局默认");
  assert.equal(defaultOptions[defaultOptions.length - 1]?.id, "clairic");

  // 3) 其他业务功能：Clairic 不可选，展示统一能力限制原因。
  const chatOptions = buildModelFamilySelectOptions(families, "content_tools");
  const chatClairic = chatOptions.find((o) => o.id === "clairic");
  assert.ok(chatClairic);
  assert.equal(chatClairic.isSelectable, false);
  assert.equal(chatClairic.scopeBlocked, true);
  assert.equal(chatClairic.disabledReason, "Cloudflare Clairic 是截图专项模型，仅支持「截图识别」功能，不支持对话或其他业务场景");
});

test("ModelFamilySelect 与服务端共用模型能力和拒绝原因，不受过期展示分类影响", () => {
  const families = [
    makeFamily("clairic", "Clairic", { modelScope: "general" }),
    makeFamily("@cf/cloudflare/clairic", "Clairic 上游名称", { modelScope: "general" }),
    makeFamily("deepseek-chat", "DeepSeek", { modelScope: "ocr_only" }),
  ];
  for (const featureKey of ["default", "content_tools", "ocr_screenshot", "future_feature"]) {
    const options = buildModelFamilySelectOptions(families, featureKey);
    for (const option of options) {
      const capability = isModelAllowedForFeature(featureKey, option.id);
      assert.equal(option.isSelectable, capability.allowed);
      assert.equal(option.scopeBlocked, !capability.allowed);
      assert.equal(option.disabledReason, capability.allowed ? null : capability.reason);
    }
  }
  assert.ok(buildModelFamilySelectOptions(families).every((option) => option.isSelectable));
});

test("OcrSpeedLogRow 多段回退记录展示「已回退」温和徽章与各段耗时拆解", () => {
  const markup = renderLogRow(
    makeLogItem({
      duration_ms: 6300,
      ocr_ms: 6300,
      channel_name: "Haiku主通道",
      model_id: "claude-haiku-5-5",
      fallback_detail: {
        attempts: [
          {
            channel_name: "CF主账号",
            model_id: "clairic",
            protocol: "cloudflare_clairic",
            ok: false,
            elapsed_ms: 1200,
            error_code: "RATE_LIMITED",
            reason: "限流429",
          },
          {
            channel_name: "CF备账号",
            model_id: "clairic",
            protocol: "cloudflare_clairic",
            ok: false,
            elapsed_ms: 1000,
            error_code: null,
            reason: null,
          },
          {
            channel_name: "Haiku主通道",
            model_id: "claude-haiku-5-5",
            protocol: "openai_compatible",
            ok: true,
            elapsed_ms: 4100,
          },
        ],
      },
    }),
  );

  assert.match(markup, /data-slot="ocr-fallback-badge"/);
  assert.match(markup, /已回退/);
  assert.match(markup, /bg-\[#F7F3ED\]/);
  assert.match(markup, /text-\[#8A6A2F\]/);
  assert.match(markup, /data-slot="ocr-fallback-timeline"/);
  assert.match(markup, /├ CF主账号 限流429 · 1\.20s/);
  assert.match(markup, /├ CF备账号 失败 · 1\.00s/);
  assert.match(markup, /└ Haiku主通道 成功 · 4\.10s/);
  assert.doesNotMatch(markup, /历史回退记录/);
});

test("OcrSpeedLogRow 单次直出与历史90天旧记录保持清爽且兼容", () => {
  // 单次直出（attempts.length === 1）不显示已回退与拆解子行
  const singleMarkup = renderLogRow(
    makeLogItem({
      duration_ms: 1420,
      ocr_ms: 1420,
      channel_name: "CF主账号",
      fallback_detail: {
        attempts: [
          {
            channel_name: "CF主账号",
            model_id: "clairic",
            protocol: "cloudflare_clairic",
            ok: true,
            elapsed_ms: 1420,
          },
        ],
      },
    }),
  );
  assert.doesNotMatch(singleMarkup, /data-slot="ocr-fallback-badge"/);
  assert.doesNotMatch(singleMarkup, /data-slot="ocr-fallback-timeline"/);
  assert.doesNotMatch(singleMarkup, /历史回退记录/);

  // 历史普通单渠道记录（fallback_detail=null 且无 ->）：不加噪音文案
  const legacyNormalMarkup = renderLogRow(
    makeLogItem({
      channel_name: "Claude主通道",
      fallback_detail: null,
    }),
  );
  assert.doesNotMatch(legacyNormalMarkup, /data-slot="ocr-fallback-badge"/);
  assert.doesNotMatch(legacyNormalMarkup, /data-slot="ocr-legacy-fallback-hint"/);

  // 历史回退记录（fallback_detail=null 且 channel_name 含 ->）：展示轻提示
  const legacyFallbackMarkup = renderLogRow(
    makeLogItem({
      channel_name: "Clairic -> Claude主通道",
      fallback_detail: null,
    }),
  );
  assert.doesNotMatch(legacyFallbackMarkup, /data-slot="ocr-fallback-badge"/);
  assert.match(legacyFallbackMarkup, /data-slot="ocr-legacy-fallback-hint"/);
  assert.match(legacyFallbackMarkup, /历史回退记录（未拆解各段耗时）/);
});

test("业务功能面板、绑定弹窗与渠道池视图已清除百度 OCR 残留并接入协议只读展示", () => {
  const bindingsSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/bindings-dialogs.tsx"),
    "utf8",
  );
  const businessSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/business-functions-panel.tsx"),
    "utf8",
  );
  const channelPoolSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/channel-pool-view.tsx"),
    "utf8",
  );

  // BindingDialog 清理百度三选一，新增 Clairic 提示词不生效说明并传递 featureKey
  assert.doesNotMatch(bindingsSource, /ocr-channel|ocr_screenshot_channel|百度|OCR\+模型|视觉直识/);
  assert.match(bindingsSource, /Clairic 是 Cloudflare 专项字段抽取模型，使用内置字段清单，系统提示词对其不生效/);
  assert.match(bindingsSource, /featureKey=\{control\?\.key\}/);

  // BusinessFunctionsPanel 清理残留，试跑仅传 feature_key，下拉透传 featureKey
  assert.doesNotMatch(businessSource, /ocr_screenshot_structure|ocr_screenshot_channel/);
  assert.match(businessSource, /runCommand\("test_key", \{ feature_key: "ocr_screenshot" \}\)/);
  assert.match(businessSource, /featureKey="default"/);
  assert.match(businessSource, /featureKey="ocr_screenshot"/);
  assert.match(businessSource, /featureKey=\{ctrl\.key\}/);

  // ChannelPoolView 展示只读接口协议行
  assert.match(channelPoolSource, /data-slot="ai-provider-protocol"/);
  assert.match(channelPoolSource, /接口协议/);
  assert.match(channelPoolSource, /标准对话接口 \(OpenAI 兼容\)/);
  assert.match(channelPoolSource, /Cloudflare Clairic/);
  assert.match(channelPoolSource, /截图专项/);
});
