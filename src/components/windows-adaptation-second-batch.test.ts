import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

test("选题复杂弹窗在低矮视口下固定标题和操作区", () => {
  const createModal = readSource("src/components/topics-v2/TopicCreateModal.tsx");
  const workDrawer = readSource(
    "src/components/topics-v2/TopicWorkBreakdownDrawer.tsx",
  );

  assert.match(createModal, /<Dialog[\s\n]+open=\{/);
  assert.match(createModal, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(createModal, /<DialogHeader[\s\S]*<DialogBody[\s\S]*<DialogFooter/);
  assert.doesNotMatch(createModal, /fixed inset-0 bg-\[#1C1917\]/);

  assert.match(workDrawer, /max-h-\[calc\(100dvh-var\(--app-top-offset,64px\)\)\]/);
  assert.match(workDrawer, /flex min-h-0[\s\S]*flex-col overflow-hidden/);
  assert.match(workDrawer, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(workDrawer, /shrink-0[\s\S]*border-t border-\[#E5E0D6\]/);
});

test("AI 型号同步弹窗把筛选区、列表和底部保存操作分层", () => {
  const source = readSource(
    "src/app/(app)/admin/ai-config/components/sync-models-dialog.tsx",
  );

  assert.match(source, /DialogBody/);
  assert.doesNotMatch(source, /max-h-\[90vh\]/);
  assert.match(source, /<DialogBody[\s\S]*min-h-0 flex-1[\s\S]*<div className="min-h-0 flex-1 overflow-y-auto/);
  assert.match(source, /<DialogHeader[\s\S]*<DialogBody[\s\S]*<DialogFooter/);
});

test("重写工作台在平板宽度收缩分栏，不制造页面横向溢出", () => {
  const source = readSource(
    "src/components/content-tools/rewrite-v3/RewriteWorkbenchV3.tsx",
  );

  assert.match(source, /md:min-w-0 lg:min-w-\[340px\]/);
  assert.match(source, /md:min-w-0 lg:min-w-\[450px\]/);
});

test("共享抽屉和截图预览使用动态视口高度", () => {
  const adaptiveSheet = readSource("src/components/ui/adaptive-sheet.tsx");
  const slotPreview = readSource("src/components/submission/截图槽位区.tsx");
  const diagnosisPreview = readSource(
    "src/app/(app)/admin/content/content-diagnosis-workbench.tsx",
  );

  assert.match(adaptiveSheet, /md:max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(adaptiveSheet, /min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(slotPreview, /max-h-\[85vh\]/);
  assert.doesNotMatch(diagnosisPreview, /max-h-\[85vh\]/);
  assert.match(slotPreview, /max-h-\[calc\(100dvh-/);
  assert.match(diagnosisPreview, /max-h-\[calc\(100dvh-/);
});

test("全局命令气泡在窄屏和低矮视口内收缩", () => {
  const source = readSource("src/components/unified-command-hub.tsx");

  assert.match(source, /w-\[min\(440px,calc\(100vw-1rem\)\)\]/);
  assert.match(
    source,
    /max-h-\[min\(580px,calc\(100dvh-var\(--app-top-offset,64px\)-1rem\)\)\]/,
  );
});

test("选题详情编辑表单固定底部保存操作", () => {
  const source = readSource("src/app/(app)/topics/[id]/page.tsx");

  assert.match(source, /DialogBody/);
  assert.match(source, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(source, /<DialogHeader[\s\S]*<DialogBody[\s\S]*<DialogFooter/);
});

test("AI 配置编辑弹窗在低矮视口下分层滚动", () => {
  const providers = readSource(
    "src/app/(app)/admin/ai-config/components/providers-dialogs.tsx",
  );
  const bindings = readSource(
    "src/app/(app)/admin/ai-config/components/bindings-client.tsx",
  );

  for (const source of [providers, bindings]) {
    assert.match(source, /DialogBody/);
    assert.match(source, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(source, /<DialogHeader[\s\S]*<DialogBody[\s\S]*<DialogFooter/);
  }
});

test("成员管理复杂弹窗和详情抽屉保留头部与操作区", () => {
  const source = readSource(
    "src/app/(app)/admin/modules/modules-content-v3.tsx",
  );

  assert.match(source, /DialogBody/);
  assert.match(source, /<DialogContent className="flex max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto/);
});

test("选题筛选浮层和 AI 模型下拉在窄屏内收缩", () => {
  const topicFilter = readSource("src/components/topics-v2/TopicPoolExplorer.tsx");
  const bindings = readSource(
    "src/app/(app)/admin/ai-config/components/bindings-client.tsx",
  );

  assert.match(topicFilter, /max-h-\[calc\(100dvh-/);
  assert.match(topicFilter, /overflow-y-auto/);
  assert.match(bindings, /w-\[min\(260px,calc\(100vw-2rem\)\)\]/);
});

test("发布管理矩阵的固定浮层在低矮视口内选择可见方向并允许滚动", () => {
  const source = readSource(
    "src/app/(app)/admin/fulfillment/components/monthly-matrix.tsx",
  );

  assert.match(source, /getTooltipPlacement/);
  assert.match(source, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(source, /overflow-y-auto/);
});
