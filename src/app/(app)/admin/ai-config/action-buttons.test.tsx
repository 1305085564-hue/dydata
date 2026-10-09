import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const computePanelSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx"),
  "utf8"
);
const modelCardSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/model-family-card.tsx"),
  "utf8"
);
const channelViewSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/channel-pool-view.tsx"),
  "utf8"
);
const syncDialogSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/sync-models-dialog.tsx"),
  "utf8"
);
const hookSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/hooks/use-ai-config.ts"),
  "utf8"
);
const shelfModelsSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/shelf-models-dialog.tsx"),
  "utf8"
);

test("工具栏按钮严格锁定为四项并具备对应说明", () => {
  // 1. 全部同步模型
  assert.match(computePanelSource, /全部同步模型/);
  assert.match(computePanelSource, /拉取所有渠道的模型清单/);

  // 2. 巡检全部渠道（原全部检测）
  assert.match(computePanelSource, /巡检全部渠道/);
  assert.match(computePanelSource, /每渠道抽测一条，快速看在线/);
  assert.doesNotMatch(computePanelSource, /aria-label="全部检测"/);

  // 3. 全部模型检测
  assert.match(computePanelSource, /全部模型检测/);
  assert.match(computePanelSource, /全部渠道全部模型，最彻底/);

  // 4. 接入渠道
  assert.match(computePanelSource, /接入渠道/);
  assert.match(computePanelSource, /接入一条新的专线/);
});

test("模型视角渠道行改名闭环：'检测此渠道全部模型'、'同步模型'、'测试连通'", () => {
  assert.match(modelCardSource, /检测此渠道全部模型/);
  assert.match(modelCardSource, /含未上架的模型/);
  assert.doesNotMatch(modelCardSource, /测全模型/);

  assert.match(modelCardSource, /打开全部模型清单/);
  assert.doesNotMatch(modelCardSource, /重新探测并同步模型/);

  assert.match(modelCardSource, /测试连通/);
  assert.match(modelCardSource, /只测通不通，最快/);
});

test("渠道视角工作台与同步弹窗按钮统一为'检测此渠道全部模型'", () => {
  assert.match(channelViewSource, /检测此渠道全部模型/);
  assert.match(channelViewSource, /含未上架的模型/);
  assert.doesNotMatch(channelViewSource, /检测渠道/);

  assert.match(syncDialogSource, /检测此渠道全部模型/);
});

test("全池全部模型检测契约对齐并展示失败明细条", () => {
  assert.match(computePanelSource, /allModelsTestFailures/);
  assert.match(computePanelSource, /全池模型深度检测异常/);
  assert.match(computePanelSource, /failures\.map/);
  assert.doesNotMatch(computePanelSource, /rawResults = \(data\.results/);
});

test("批量模型检测使用长任务超时并给出可继续检测的进度反馈", () => {
  assert.match(hookSource, /AI_MODEL_BATCH_TIMEOUT_MS = 120_000/);
  assert.match(hookSource, /AI_MODEL_BATCH_TIMEOUT_MESSAGE = "检测耗时较长，已中断"/);
  assert.match(computePanelSource, /已测 .*共 .*个/);
  assert.match(computePanelSource, /继续检测/);
  assert.match(syncDialogSource, /AI_MODEL_BATCH_TIMEOUT_MESSAGE/);
  assert.match(syncDialogSource, /正在检测模型 · 已测 0 \/ 共/);
  assert.match(shelfModelsSource, /测了 .*通过 .*失败/);
});
