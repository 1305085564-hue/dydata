// 浏览器隔离验收页：只调用本地回调，绝不连接业务接口。
// 构建：node_modules/tsx/node_modules/esbuild/bin/esbuild tests/compatibility/输入法回车.fixture.tsx --bundle --platform=browser --outfile=/tmp/dydata-ime/app.js
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ModelFamilyCard } from "../../src/app/(app)/admin/ai-config/components/model-family-card";
import type { AvailabilityModelFamily } from "../../src/lib/ai-config/availability";
import { toDateTimeLocalValue } from "../../src/lib/video-submit/domain/form-rules";
import { normalizePublishedAtForStorage } from "../../src/lib/日报";

const fixtureFamily: AvailabilityModelFamily = {
  modelId: "fixture-model",
  displayName: "测试模型",
  globalIsEnabled: true,
  isShelved: true,
  isSelectable: true,
  isConfigured: true,
  singlePointRisk: false,
  redundancyCount: 0,
  healthyChannelCount: 1,
  schedulableChannelCount: 1,
  untestedChannelCount: 0,
  faultChannelCount: 0,
  channelReadyButGlobalDisabled: 0,
  unavailableReasonKey: null,
  identityCounts: { active: 1, retest: 0, sleeping: 0, invalid: 0, disabled: 0 },
  channels: [
    {
      keyModelId: "fixture-record",
      keyId: "fixture-key",
      modelId: "fixture-model",
      providerId: "fixture-provider",
      providerName: "测试服务",
      label: "测试渠道",
      identity: "active",
      health: "healthy",
      isSchedulable: true,
      messageKey: "channel.usable",
      sortOrder: 1,
      sleepUntil: null,
      sleepSource: null,
      persistentFailure: false,
    },
  ],
};

function Fixture() {
  const [saves, setSaves] = useState(0);
  const publishedAt = toDateTimeLocalValue("2026-10-28T00:30:00+08:00");
  return <main>
    <h1>输入法回车隔离验收（无业务写入）</h1>
    <p>设备时区：{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    <p>上海发布时间：{publishedAt}；保存值：{normalizePublishedAtForStorage(publishedAt)}</p>
    <output>保存次数：{saves}</output>
    <ModelFamilyCard
      family={fixtureFamily}
      onRenameSupply={async () => { setSaves((count) => count + 1); }}
      onSwapOrder={async () => {}}
    />
    {[{ name: "组合输入回车", isComposing: true, keyCode: 13 },
      { name: "229确认回车", isComposing: false, keyCode: 229 },
      { name: "正常回车", isComposing: false, keyCode: 13 },
      { name: "组合输入空格", isComposing: true, keyCode: 32 },
    ].map(({ name, ...event }) => <button key={name}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => document.querySelector('input')?.dispatchEvent(new KeyboardEvent('keydown', {
        ...event, key: event.keyCode === 32 ? ' ' : 'Enter', bubbles: true, cancelable: true,
      }))}>{name}</button>)}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
