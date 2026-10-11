import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("视图切换给出加载反馈，且不再整块禁用工具栏（审计 H2）", () => {
  const viewControls = read("src/app/(app)/admin/content/content-list-view-controls.tsx");
  const pageClient = read("src/app/(app)/admin/content/content-page-client.tsx");

  // 切换期间必须有文字级反馈：实测切归档要 11.7 秒，静默期间用户会反复点
  assert.match(viewControls, /正在加载/, "缺少「正在加载X…」文案，长耗时切换仍无反馈");
  assert.match(viewControls, /Loader2|animate-spin/, "缺少转圈指示");
  assert.match(viewControls, /aria-busy/, "加载态未暴露 aria-busy");
  assert.match(viewControls, /role="status"/, "加载提示未标记为状态区，读屏用户听不到");

  // 关键回归：以前整块列表（含工具栏）被 pointer-events-none 一起禁掉，
  // 用户既看不到提示、也点不了任何东西，比不加更糟
  assert.doesNotMatch(
    pageClient,
    /isLoading \? "opacity-65 pointer-events-none"/,
    "工具栏仍随整块一起被禁用：加载期间用户无法操作，且看不出在加载什么",
  );
});

test("视图切换期间分段控件不可重复点击，避免重复发起取数", () => {
  const viewControls = read("src/app/(app)/admin/content/content-list-view-controls.tsx");
  const buttonCount = (viewControls.match(/disabled=\{isViewLoading\}/g) ?? []).length;
  assert.ok(buttonCount >= 2, `全部/归档两个按钮都应防重复点击，实际只有 ${buttonCount} 个`);
  assert.match(viewControls, /aria-pressed/, "分段控件缺少选中态语义");
});
