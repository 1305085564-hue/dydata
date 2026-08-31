import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { cn } from "@/lib/utils";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Dialog 基座限制在安全动态视口内，同时允许业务弹窗覆盖滚动策略", () => {
  const source = readSource("src/components/ui/dialog.tsx");

  assert.match(source, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(source, /overflow-y-auto/);
  assert.match(source, /className=\{cn\("flex shrink-0 flex-col gap-2", className\)\}/);
  assert.match(source, /"flex shrink-0 flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end"/);
  assert.match(source, /data-slot="dialog-body"[\s\S]*min-h-0 flex-1 overflow-y-auto/);
  assert.match(source, /export \{[\s\S]*DialogBody,/);

  assert.equal(
    cn("grid overflow-y-auto", "flex flex-col overflow-hidden"),
    "flex flex-col overflow-hidden",
  );
});

test("申请豁免弹窗保留移动端全屏，并固定标题、滚动正文与底部操作", () => {
  const source = readSource("src/app/(app)/dashboard/申请豁免弹窗.tsx");
  const mountedSource = readSource("src/app/(app)/dashboard/redesign/exemption-dialog-v2.tsx");

  assert.match(source, /max-sm:h-dvh/);
  assert.match(source, /max-sm:max-h-none/);
  assert.match(source, /<DialogHeader[\s\S]*<DialogBody[\s\S]*<DialogFooter/);
  assert.match(mountedSource, /<Dialog open=\{isOpen\}/);
  assert.match(mountedSource, /<DialogContent[\s\S]*<DialogHeader[\s\S]*<DialogBody[\s\S]*<DialogFooter/);
  assert.doesNotMatch(mountedSource, /fixed left-1\/2 top-1\/2/);
});

test("复杂弹窗把可滚内容与固定操作区分离", () => {
  const panel = readSource("src/app/(app)/dashboard/video-submit-panel-v2.tsx");
  const historyEdit = readSource("src/app/(app)/dashboard/history-report-edit-form.tsx");
  const patch24h = readSource("src/app/(app)/admin/videos/patch-24h-dialog.tsx");

  assert.match(panel, /历史[\s\S]*<DialogBody[\s\S]*<HistoryList/);
  assert.match(historyEdit, /<DialogBody[\s\S]*<DialogFooter/);
  assert.match(historyEdit, /共创伙伴/);
  assert.match(patch24h, /<DialogHeader[\s\S]*<DialogBody[\s\S]*<DialogFooter/);
});

test("Windows 高度计算统一使用动态视口单位", () => {
  const list = readSource("src/app/(app)/admin/videos/video-list.tsx");
  const detail = readSource("src/app/(app)/admin/videos/video-detail-dialog.tsx");

  assert.match(list, /calc\(100dvh - 260px\)/);
  assert.doesNotMatch(list, /calc\(100vh - 260px\)/);
  assert.match(detail, /calc\(100dvh-65px\)/);
  assert.doesNotMatch(detail, /calc\(100vh-65px\)/);
});
