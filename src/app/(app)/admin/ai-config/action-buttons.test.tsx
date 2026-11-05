import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  assert.doesNotMatch(modelCardSource, /休眠期间顺位锁定/);
});
