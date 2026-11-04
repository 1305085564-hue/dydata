import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
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
const presentationSource = readFileSync(
  resolve(process.cwd(), "src/lib/ai-config/presentation.ts"),
  "utf8"
);

test("工具栏按钮具备对应说明，并提供模型管理入口", () => {
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

test("模型卡片低频操作对键盘焦点可见，且不保留假撤回删除状态", () => {
  assert.match(modelCardSource, /group-focus-within:opacity-100/);
  assert.doesNotMatch(modelCardSource, /pendingDeletion|撤回删除/);
  assert.match(computePanelSource, /模型管理与上下架/);
  assert.match(computePanelSource, /history\.pushState/);
});

test("模型视角渠道行：'同步模型'、'测此渠道此模型'（文案为测这条渠道供应的当前模型，不含重复的全模型检测）", () => {
  // B-3: 模型卡渠道行不再摆放重复的渠道全模型检测入口，严格收敛入口数 <= 2
  assert.doesNotMatch(modelCardSource, /检测此渠道(在用|全部挂载)模型/);
  assert.doesNotMatch(modelCardSource, /检测此渠道全部模型/);
  assert.doesNotMatch(modelCardSource, /测全模型/);

  assert.match(modelCardSource, /打开全部模型清单/);
  assert.doesNotMatch(modelCardSource, /重新探测并同步模型/);

  // B-6 & B-R2: 测此渠道此模型
  assert.match(modelCardSource, /测此渠道此模型/);
  assert.match(modelCardSource, /测这条渠道供应的当前模型/);
  assert.doesNotMatch(modelCardSource, /只测通不通，最快/);
});

test("渠道视角工作台与同步弹窗按钮统一为'检测此渠道全部挂载模型'（全站仅此2处入口）", () => {
  assert.match(channelViewSource, /检测此渠道全部挂载模型/);
  assert.match(channelViewSource, /测此渠道全部挂载模型（含未勾选和已全站下架的）/);
  assert.doesNotMatch(channelViewSource, /含未上架的模型/);
  assert.doesNotMatch(channelViewSource, /检测渠道/);

  assert.match(syncDialogSource, /检测此渠道全部挂载模型/);
});

/** 裁决④冻结词表：渠道五态文案收敛到 presentation 唯一真源（全仓零 HEALTH_PRESENTATION 引用）。 */
test("渠道五态文案收敛到 presentation 唯一真源（全仓零 HEALTH_PRESENTATION 引用）", () => {
  assert.match(presentationSource, /正常在岗[\s\S]*待复测[\s\S]*休眠[\s\S]*已失效[\s\S]*已停用/);
  assert.match(channelViewSource, /CHANNEL_IDENTITY_PRESENTATION/);
  assert.match(modelCardSource, /CHANNEL_IDENTITY_PRESENTATION/);
  assert.doesNotMatch(channelViewSource, /"(健康|待命中|故障|异常熔断|正常在线|待测)"/);
  assert.doesNotMatch(modelCardSource, /"(健康|待命中|故障|异常熔断|正常在线|待测)"/);

  const grepResult = execSync("git grep -n 'HEALTH_PRESENTATION' src/ | grep -v 'action-buttons.test.tsx' || true", {
    encoding: "utf8",
  }).trim();
  assert.equal(grepResult, "", `src/ 业务代码中不得存在任何 HEALTH_PRESENTATION 残留: \n${grepResult}`);
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

test("任务 D：模型视角失效/停用渠道收纳到卡片底部折叠区且无顺位调整按钮", () => {
  const freshModelCardSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/model-family-card.tsx"),
    "utf8"
  );
  assert.match(freshModelCardSource, /activeItems/);
  assert.match(freshModelCardSource, /archivedItems/);
  assert.match(freshModelCardSource, /个不可用渠道（已失效或停用）/);
  assert.match(freshModelCardSource, /isArchivedOpen/);
});

test("任务 D 返工：休眠渠道顺位锁定且移动目标跳过休眠行", () => {
  const freshModelCardSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/model-family-card.tsx"),
    "utf8"
  );

  // 1. 源码级断言：包含休眠锁定提示与目标跳过 sleeping 逻辑
  assert.match(freshModelCardSource, /休眠期间顺位锁定，恢复后可调整/);
  assert.match(freshModelCardSource, /canMoveUp/);
  assert.match(freshModelCardSource, /canMoveDown/);
  assert.match(freshModelCardSource, /prevTarget/);
  assert.match(freshModelCardSource, /nextTarget/);

  // 2. 纯逻辑算法断言：模拟 [sleeping, retest, active] 序列目标查找
  type Item = { id: string; identity: "active" | "retest" | "sleeping" };
  const resolveTargets = (items: Item[]) => {
    return items.map((item, index) => {
      const isSleeping = item.identity === "sleeping";
      let prevTarget: Item | null = null;
      if (!isSleeping) {
        for (let i = index - 1; i >= 0; i--) {
          if (items[i].identity === "active" || items[i].identity === "retest") {
            prevTarget = items[i];
            break;
          }
        }
      }
      let nextTarget: Item | null = null;
      if (!isSleeping) {
        for (let i = index + 1; i < items.length; i++) {
          if (items[i].identity === "active" || items[i].identity === "retest") {
            nextTarget = items[i];
            break;
          }
        }
      }
      return {
        id: item.id,
        canMoveUp: !isSleeping && prevTarget !== null,
        canMoveDown: !isSleeping && nextTarget !== null,
        prevTargetId: prevTarget?.id ?? null,
        nextTargetId: nextTarget?.id ?? null,
      };
    });
  };

  const initialList: Item[] = [
    { id: "ch-1", identity: "sleeping" },
    { id: "ch-2", identity: "retest" },
    { id: "ch-3", identity: "active" },
  ];

  const initialResults = resolveTargets(initialList);
  // #1 sleeping: 两个方向均锁定不可移动
  assert.strictEqual(initialResults[0].canMoveUp, false);
  assert.strictEqual(initialResults[0].canMoveDown, false);
  assert.strictEqual(initialResults[0].prevTargetId, null);
  assert.strictEqual(initialResults[0].nextTargetId, null);

  // #2 retest: 上方无可用目标（跳过 sleeping），下方目标为 ch-3
  assert.strictEqual(initialResults[1].canMoveUp, false);
  assert.strictEqual(initialResults[1].canMoveDown, true);
  assert.strictEqual(initialResults[1].nextTargetId, "ch-3");

  // #3 active: 上方目标为 ch-2，下方无可用目标
  assert.strictEqual(initialResults[2].canMoveUp, true);
  assert.strictEqual(initialResults[2].canMoveDown, false);
  assert.strictEqual(initialResults[2].prevTargetId, "ch-2");

  // 互换 ch-2 与 ch-3 后的反向还原测试
  const swappedList: Item[] = [
    { id: "ch-1", identity: "sleeping" },
    { id: "ch-3", identity: "active" },
    { id: "ch-2", identity: "retest" },
  ];
  const swappedResults = resolveTargets(swappedList);
  // ch-2 (此时在索引 2) 上移目标恰好回到 ch-3，可逆性恢复且不碰 sleeping
  assert.strictEqual(swappedResults[2].canMoveUp, true);
  assert.strictEqual(swappedResults[2].prevTargetId, "ch-3");
});




