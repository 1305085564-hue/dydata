import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dialogSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/sync-models-dialog.tsx"),
  "utf8"
);

test("SyncModelsDialog 标题去掉接入点名只显示渠道名称", () => {
  // 必须只渲染 keyLabel，不再拼接 providerName
  assert.match(dialogSource, /<DialogTitle[^>]*>\s*\{keyLabel\}\s*<\/DialogTitle>/);
  assert.doesNotMatch(dialogSource, /providerName/);
});

test("SyncModelsDialog 严格遵循存量口径与计数，禁止出现增量获取文案", () => {
  // 严禁出现「已从渠道获取 N 个可用型号」等增量文案
  assert.doesNotMatch(dialogSource, /已从渠道获取/);
  assert.match(dialogSource, /已勾选/);
  assert.match(dialogSource, /已勾选.*\/ 共.*个/);
  assert.match(dialogSource, /selectedModelIds\.size/);
  assert.match(dialogSource, /currentInventory\.length/);
});

test("SyncModelsDialog 覆盖现役、本渠道启用、新增、储备中四类分区标识", () => {
  assert.match(dialogSource, /"现役"/);
  assert.match(dialogSource, /"本渠道启用"/);
  assert.match(dialogSource, /"新增"/);
  assert.match(dialogSource, /"储备中"/);
  assert.match(dialogSource, /isGlobalActive/);
  assert.match(dialogSource, /isEnabled/);
  assert.match(dialogSource, /isNewlyDiscovered/);
});

test("SyncModelsDialog 严格区分拉取中、拉取失败、真的0个三类空态，失败提供重试", () => {
  assert.match(dialogSource, /正在拉取该渠道全部模型列表/);
  assert.match(dialogSource, /模型列表同步失败/);
  assert.match(dialogSource, /重试/);
  assert.match(dialogSource, /此渠道尚未返回任何模型/);
  // 禁止把失败误显示为「还没有可启用的型号」
  assert.doesNotMatch(dialogSource, /还没有可启用的型号/);
});

test("SyncModelsDialog 底部提供'检测此渠道全部挂载模型'入口及逐条结果清单", () => {
  assert.match(dialogSource, /检测此渠道全部挂载模型/);
  assert.match(dialogSource, /onTestKeyAllModels/);
  assert.match(dialogSource, /ChannelModelTestList/);
  assert.match(dialogSource, /testSummary\.results\.map/);
});

test("SyncModelsDialog 避免无限循环打接口：使用 onSyncRef 与 inFlightKeyIdRef 防抖防重", () => {
  assert.match(dialogSource, /const onSyncRef = useRef\(onSync\)/);
  assert.match(dialogSource, /const inFlightKeyIdRef = useRef/);
  assert.match(dialogSource, /if \(inFlightKeyIdRef\.current === targetKeyId\) return/);
  // effect 不可把不稳定 onSync 作为直接依赖触发循环
  assert.doesNotMatch(dialogSource, /useEffect\([^)]*,\s*\[[^\]]*onSync[^\]]*\]\)/);
});

test("SyncModelsDialog 后台刷新期间保持'检测此渠道全部挂载模型'按钮可用，不误禁用", () => {
  assert.match(dialogSource, /const isFirstLoading = loading && inventory === null/);
  assert.match(dialogSource, /disabled=\{testingChannel \|\| saving \|\| isFirstLoading/);
});

test("SyncModelsDialog 区分首次拉取与后台刷新，杜绝'正在拉取'与完整列表同时出现", () => {
  assert.match(dialogSource, /const isFirstLoading = loading && inventory === null/);
  assert.match(dialogSource, /const isRefreshing = loading && inventory !== null/);
  assert.match(dialogSource, /isFirstLoading \?\s*\([\s\S]*?正在拉取该渠道全部模型列表/);
  assert.match(dialogSource, /isRefreshing &&\s*\([\s\S]*?正在刷新\.\.\./);
  // 渲染列表的区域不允许再出现「正在拉取该渠道全部模型列表」
  const listArea = dialogSource.slice(dialogSource.indexOf("filteredModels.map"));
  assert.doesNotMatch(listArea, /正在拉取该渠道全部模型列表/);
});

test("B-R1: SyncModelsDialog 呈现幽灵模型比对三态，不以0冒充，提供收走入口", () => {
  // 确认不可用：显示「N 个模型上游已不再提供」并逐条列出模型名，给收走入口
  assert.match(dialogSource, /个模型上游已不再提供/);
  assert.match(dialogSource, /一键收走全部已确认失效模型/);
  assert.match(dialogSource, /handleRemoveSingleModel/);
  assert.match(dialogSource, /onRemoveModel/);

  // 仅清单里没有、但实测能通或未测：显示「疑似，未验证」，不给一键收走
  assert.match(dialogSource, /个模型仅清单中未列出（疑似，未验证）/);
  assert.match(dialogSource, /疑似，未验证/);
  assert.doesNotMatch(dialogSource, /一键收走.*疑似/);

  // 无法判定 / 未成功同步：显示「未知 · 尚未成功同步」，禁止显示 0
  assert.match(dialogSource, /上游模型比对状态：未知 · 尚未成功同步/);
  assert.match(dialogSource, /不展示猜测数字/);
});


