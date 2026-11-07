import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { CHANNEL_MESSAGE_KEYS } from "@/lib/ai-config/presentation";
import { channelOrderResetKey, findMoveTarget, ModelFamilyCard } from "./components/model-family-card";
import { modelToggleSuccessMessage } from "./components/compute-pool-panel";
import { applyFrozenOrder } from "@/lib/ai-config/list-order";
import type { AvailabilityChannel, AvailabilityModelFamily } from "@/lib/ai-config/availability";

const computePanelSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx"),
  "utf8"
);
const computeHeaderSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/compute-pool-header.tsx"),
  "utf8"
);
const modelCardSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/model-family-card.tsx"),
  "utf8"
);
const modelTestListSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/channel-model-test-list.tsx"),
  "utf8"
);

test("S1 & S3 顶部摘要与操作按钮：检查一遍与接入新渠道", () => {
  // S3: 顶部摘要一行字
  assert.match(computeHeaderSource, /个功能正常/);
  assert.match(computeHeaderSource, /个在顶班/);
  assert.match(computeHeaderSource, /个停摆/);
  assert.match(computeHeaderSource, /条渠道要你处理/);

  // S1: 合并为一个「检查一遍」按钮，小字只查正在用的模型
  assert.match(computeHeaderSource, /检查一遍/);
  assert.match(computeHeaderSource, /只查正在用的模型/);
  assert.match(computePanelSource, /check_all_in_use/);

  // 接入新渠道
  assert.match(computeHeaderSource, /接入新渠道/);
});

test("S2 最近一次检查结果组件：正确呈现总数、通过数与失败数", () => {
  assert.match(modelTestListSource, /最近一次检查结果/);
  assert.match(modelTestListSource, /现在没有需要检查的对象/);
  assert.match(modelTestListSource, /共查.*组，.*组通过，.*组失败/);
});

test("D1: 模型管理与上下架弹窗已删除，改为列表上方只看在用/全部切换", () => {
  assert.match(computePanelSource, /只看在用/);
  assert.match(computePanelSource, /全部模型/);
  assert.doesNotMatch(computePanelSource, /ModelManagerDialog/);
  assert.doesNotMatch(computePanelSource, /ShelfModelsDialog/);
});

test("S5: 模型卡汇总：M 条渠道供货，N 条能用；恰好 1 条能用有单点建议", () => {
  assert.match(modelCardSource, /条渠道供货，.*条能用/);
  assert.match(modelCardSource, /model\.single_supply/);
  assert.match(modelCardSource, /unavailableReasonKey/);
});

test("口径 4: 渠道顺位调整相邻关系按 sortOrder 判断，不按临时恢复数组下标判断", () => {
  assert.match(modelCardSource, /sort\(\(a, b\) => a\.sortOrder - b\.sortOrder\)/);
  assert.match(computePanelSource, /swap_model_channel_order/);
});

test("口径 5: 渠道状态收敛到四种状态，需要你处理留在主列表，只有已停用可以折叠", () => {
  assert.match(modelCardSource, /disabledChannels/);
  assert.match(modelCardSource, /已停用的供应/);
});

test("D2: 删掉临时休眠 30 分钟与恢复调度相关代码与提示", () => {
  assert.doesNotMatch(modelCardSource, /临时休眠/);
});

function makeChannel(
  keyModelId: string,
  identity: AvailabilityChannel["identity"],
  sortOrder: number,
  label = `${keyModelId} 渠道`,
): AvailabilityChannel {
  const schedulable = identity === "active" || identity === "retest";
  return {
    identity,
    isSchedulable: schedulable,
    sleepSource: null,
    sleepUntil: null,
    persistentFailure: false,
    messageKey: CHANNEL_MESSAGE_KEYS[identity],
    sortOrder,
    keyModelId,
    keyId: `key-${keyModelId}`,
    modelId: "model-x",
    providerId: "provider-1",
    providerName: `${keyModelId} 接入点`,
    label,
    health: identity === "disabled" ? "disabled" : schedulable ? "healthy" : "fault",
  };
}

function makeFamily(channels: AvailabilityChannel[]): AvailabilityModelFamily {
  const identityCounts = { active: 0, retest: 0, sleeping: 0, invalid: 0, disabled: 0 };
  for (const channel of channels) identityCounts[channel.identity]++;
  const schedulableChannelCount = channels.filter((channel) => channel.isSchedulable).length;
  return {
    modelId: "model-x",
    displayName: "测试模型",
    isShelved: true,
    globalIsEnabled: true,
    channelReadyButGlobalDisabled: 0,
    channels,
    identityCounts,
    redundancyCount: Math.max(0, schedulableChannelCount - 1),
    singlePointRisk: schedulableChannelCount <= 1,
    healthyChannelCount: channels.filter((channel) => channel.health === "healthy").length,
    untestedChannelCount: 0,
    schedulableChannelCount,
    faultChannelCount: channels.filter((channel) => channel.health === "fault").length,
    isConfigured: true,
    isSelectable: schedulableChannelCount > 0,
    unavailableReasonKey: schedulableChannelCount > 0 ? null : "model.no_available_supply",
  };
}

function rowMarkup(markup: string, label: string): string {
  const segment = markup.split('data-slot="ai-channel-row"').find((part) => part.includes(label));
  assert.ok(segment, `未找到渠道行：${label}`);
  return segment;
}

function countTitle(segment: string, title: string): number {
  return (segment.match(new RegExp(`title="${title}"`, "g")) ?? []).length;
}

test("A: 顺位交换只发生在两端都可调度的渠道之间，中间不可调度渠道被跳过", () => {
  const channels = [
    makeChannel("A", "active", 1),
    makeChannel("S", "sleeping", 2),
    makeChannel("B", "active", 3),
  ];

  assert.equal(findMoveTarget(channels, "A", 1)?.keyModelId, "B");
  assert.equal(findMoveTarget(channels, "B", -1)?.keyModelId, "A");
  assert.equal(findMoveTarget(channels, "S", 1), null);
  assert.equal(findMoveTarget(channels, "S", -1), null);
  assert.equal(findMoveTarget(channels, "A", -1), null);
  assert.equal(findMoveTarget(channels, "B", 1), null);

  const invalid = makeChannel("I", "invalid", 4);
  const disabled = makeChannel("D", "disabled", 0);
  assert.equal(findMoveTarget([...channels, invalid], "I", -1), null);
  assert.equal(findMoveTarget([disabled, ...channels], "D", 1), null);
});

test("A: 只有一条可调度渠道时两个方向都没有交换目标", () => {
  const only = makeChannel("only", "active", 1);
  assert.equal(findMoveTarget([only], "only", -1), null);
  assert.equal(findMoveTarget([only], "only", 1), null);
});

test("A: 渲染时休眠/失效行禁用顺位按钮并给出锁定提示，可调度行给出方向提示", () => {
  const family = makeFamily([
    makeChannel("S", "sleeping", 1),
    makeChannel("A", "active", 2),
    makeChannel("B", "active", 3),
  ]);
  const markup = renderToStaticMarkup(<ModelFamilyCard family={family} />);

  const sleepingRow = rowMarkup(markup, "S 渠道");
  assert.equal(countTitle(sleepingRow, "休眠期间顺位锁定，恢复后可调整"), 2);
  assert.equal(countTitle(sleepingRow, "上移顺位"), 0);
  assert.equal(countTitle(sleepingRow, "下移顺位"), 0);

  const firstUsableRow = rowMarkup(markup, "A 渠道");
  assert.equal(countTitle(firstUsableRow, "没有可交换的可用渠道"), 1);
  assert.equal(countTitle(firstUsableRow, "下移顺位"), 1);

  const lastUsableRow = rowMarkup(markup, "B 渠道");
  assert.equal(countTitle(lastUsableRow, "上移顺位"), 1);
  assert.equal(countTitle(lastUsableRow, "没有可交换的可用渠道"), 1);
});

test("A: 仅有已停用供应的模型自动展开折叠区，行内顺位按钮全部锁定", () => {
  const family = makeFamily([makeChannel("D", "disabled", 1)]);
  const markup = renderToStaticMarkup(<ModelFamilyCard family={family} />);

  const disabledRow = rowMarkup(markup, "D 渠道");
  assert.equal(countTitle(disabledRow, "该渠道当前不可调度，不能调整顺位"), 2);
  assert.equal(countTitle(disabledRow, "上移顺位"), 0);
  assert.equal(countTitle(disabledRow, "下移顺位"), 0);
});

test("A: 单条可调度渠道的上下移按钮都不可用", () => {
  const family = makeFamily([makeChannel("only", "active", 1)]);
  const markup = renderToStaticMarkup(<ModelFamilyCard family={family} />);

  const onlyRow = rowMarkup(markup, "only 渠道");
  assert.equal(countTitle(onlyRow, "没有可交换的可用渠道"), 2);
});

test("B: 恢复提示只覆盖响应能证明的结果", () => {
  assert.equal(modelToggleSuccessMessage(false), "已停用模型");
  assert.equal(
    modelToggleSuccessMessage(true, 0),
    "本次未恢复任何渠道供应；手动停用的渠道需逐条开启",
  );
  assert.equal(modelToggleSuccessMessage(true, 2), "已重新开启 2 条渠道供应");
  assert.equal(
    modelToggleSuccessMessage(true, undefined),
    "恢复请求已处理；实际开启条数未返回，请查看渠道状态",
  );
  assert.doesNotMatch(modelToggleSuccessMessage(true, 0), /本来就|测试通过|已恢复健康/);
});

test("B: 渠道顺序标记只在成员或真实顺位变化时失效", () => {
  const base = [makeChannel("A", "active", 1), makeChannel("B", "retest", 2)];
  const identityOnlyChange = [
    makeChannel("A", "sleeping", 1),
    makeChannel("B", "active", 2),
  ];
  assert.equal(channelOrderResetKey(base), channelOrderResetKey(identityOnlyChange));
  assert.equal(
    channelOrderResetKey(base),
    channelOrderResetKey([makeChannel("B", "retest", 2), makeChannel("A", "active", 1)]) ,
  );

  assert.notEqual(channelOrderResetKey(base), channelOrderResetKey([
    makeChannel("A", "active", 2),
    makeChannel("B", "retest", 1),
  ]));
  assert.notEqual(channelOrderResetKey(base), channelOrderResetKey([...base, makeChannel("C", "active", 3)]));
  assert.notEqual(channelOrderResetKey(base), channelOrderResetKey([base[0]]));
});

test("B: 固定成员在输入顺序变化时保持位置，新增成员排到末尾", () => {
  const a = makeChannel("A", "active", 1);
  const b = makeChannel("B", "retest", 2);
  const compare = (x: AvailabilityChannel, y: AvailabilityChannel) =>
    x.sortOrder - y.sortOrder || x.keyModelId.localeCompare(y.keyModelId);
  const ids = [a, b].sort(compare).map((channel) => channel.keyModelId);

  assert.deepEqual(
    applyFrozenOrder([b, a], ids, (channel) => channel.keyModelId, compare).map((channel) => channel.keyModelId),
    ["A", "B"],
  );
  assert.deepEqual(
    applyFrozenOrder([b, a, makeChannel("C", "active", 3)], ids, (channel) => channel.keyModelId, compare)
      .map((channel) => channel.keyModelId),
    ["A", "B", "C"],
  );
});

test("B: 模型卡按真实顺位渲染，不把待复测渠道提到前面", () => {
  const family = makeFamily([
    makeChannel("B", "retest", 2),
    makeChannel("A", "active", 1),
  ]);
  const markup = renderToStaticMarkup(<ModelFamilyCard family={family} />);
  assert.ok(markup.indexOf("A 渠道") < markup.indexOf("B 渠道"));
});

test("B: 主动调整顺位后按新顺位渲染", () => {
  const family = makeFamily([
    makeChannel("A", "active", 2),
    makeChannel("B", "retest", 1),
  ]);
  const markup = renderToStaticMarkup(<ModelFamilyCard family={family} />);
  assert.ok(markup.indexOf("B 渠道") < markup.indexOf("A 渠道"));
});
