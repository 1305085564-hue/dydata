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
const modelTestListSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/channel-model-test-list.tsx"),
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
  assert.match(computePanelSource, /接入一条新的渠道/);
});

test("模型视角渠道行：'同步模型'、'测此渠道此模型'（文案为测这条渠道供应的当前模型，不含重复的全模型检测）", () => {
  // B-3: 模型卡渠道行不再摆放重复的'检测此渠道在用模型'，严格收敛入口数 <= 2
  assert.doesNotMatch(modelCardSource, /检测此渠道在用模型/);
  assert.doesNotMatch(modelCardSource, /检测此渠道全部模型/);
  assert.doesNotMatch(modelCardSource, /测全模型/);

  assert.match(modelCardSource, /打开全部模型清单/);
  assert.doesNotMatch(modelCardSource, /重新探测并同步模型/);

  // B-6 & B-R2: 测此渠道此模型
  assert.match(modelCardSource, /测此渠道此模型/);
  assert.match(modelCardSource, /测这条渠道供应的当前模型/);
  assert.doesNotMatch(modelCardSource, /只测通不通，最快/);
});

test("渠道视角工作台与同步弹窗按钮统一为'检测此渠道在用模型'（全站仅此2处入口）", () => {
  assert.match(channelViewSource, /检测此渠道在用模型/);
  assert.match(channelViewSource, /测此渠道所有在用模型/);
  assert.doesNotMatch(channelViewSource, /含未上架的模型/);
  assert.doesNotMatch(channelViewSource, /检测渠道/);

  assert.match(syncDialogSource, /检测此渠道在用模型/);
});

test("全池全部模型检测契约对齐并展示失败明细条", () => {
  assert.match(computePanelSource, /allModelsTestFailures/);
  assert.match(computePanelSource, /全池模型深度检测异常/);
  assert.match(computePanelSource, /failures\.map/);
  assert.doesNotMatch(computePanelSource, /rawResults = \(data\.results/);
});

test("批量模型检测使用长任务超时并给出可继续检测的进度反馈", () => {
  assert.match(hookSource, /AI_MODEL_BATCH_TIMEOUT_MS = 120_000/);
  assert.doesNotMatch(computePanelSource, /已测 0/);
  assert.match(computePanelSource, /正在检测\s*\{modelTestingState\.total\}\s*个模型…/);
  assert.match(computePanelSource, /继续检测/);
  assert.match(syncDialogSource, /AI_MODEL_BATCH_TIMEOUT_MESSAGE/);
  assert.match(syncDialogSource, /正在检测\s*\{currentInventory\.length\}\s*个模型…/);
  assert.doesNotMatch(syncDialogSource, /已测 0/);
  assert.match(shelfModelsSource, /测了 \{testResults\.results\.length\} 个模型 · 通过 \{onlineCount\} 个 · 未通过 \{failureCount\} 个/);
});

test("SyncModelsDialog 结果条常驻并逐条铺开每个模型的通过/未通过", () => {
  assert.match(syncDialogSource, /测了[\s\S]*results\.length[\s\S]*通过[\s\S]*successCount[\s\S]*未通过[\s\S]*failureCount/);
  assert.match(syncDialogSource, /ChannelModelTestList/);
  assert.match(syncDialogSource, /getModelDisplayName\(r\.modelId\)/);
  // 结果必须直接铺开，不再要求用户再点一次「查看失败原因」
  assert.doesNotMatch(syncDialogSource, /查看失败原因/);
});

test("结果清单逐条展示模型名、model_id、已通过耗时与失败原因，且兜底为未返回原因", () => {
  assert.match(modelTestListSource, /已通过/);
  assert.match(modelTestListSource, /未通过/);
  assert.match(modelTestListSource, /失败原因：/);
  assert.match(modelTestListSource, /未返回原因/);
  assert.match(modelTestListSource, /formatLatency\(row\.latencyMs\)/);
  assert.match(modelTestListSource, /break-words whitespace-pre-wrap/);

  // 页面结果条与同步弹窗共用同一清单组件
  assert.match(shelfModelsSource, /ChannelModelTestList/);
  assert.match(shelfModelsSource, /getModelDisplayName\(r\.modelId\)/);
  assert.match(shelfModelsSource, /r\.keyName \? `\$\{r\.modelId\} · \$\{r\.keyName\}` : r\.modelId/);
});

test("结果条在同步模型弹窗内部常驻显示且关闭后重开仍保留", () => {
  const freshSyncSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/sync-models-dialog.tsx"),
    "utf8"
  );
  const freshComputeSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx"),
    "utf8"
  );
  const testSummaryIndex = freshSyncSource.indexOf("渠道全模型检测结果展示区");
  const searchIndex = freshSyncSource.indexOf("顶部搜索与快捷批量操作");
  assert.ok(testSummaryIndex > 0 && testSummaryIndex < searchIndex, "结果条必须在顶部搜索与模型列表上方");

  assert.match(freshComputeSource, /channelTestSummaries/);
  assert.match(freshComputeSource, /lastTestSummary=\{syncDialog\.keyId \? channelTestSummaries\.get\(syncDialog\.keyId\)/);
  assert.match(freshSyncSource, /lastTestSummary/);
});



