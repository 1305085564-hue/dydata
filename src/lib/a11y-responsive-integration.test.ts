import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("含子控件的卡片不再把外层伪装成按钮", () => {
  const paths = [
    "src/app/(app)/admin/ai-config/components/providers-client.tsx",
    "src/app/(app)/admin/ai-config/components/rewrite-client.tsx",
    "src/app/(app)/admin/content/content-list.tsx",
    "src/app/(app)/admin/modules/modules-content-v2.tsx",
    "src/app/(app)/dashboard/history-list.tsx",
    "src/app/(app)/video-review/components/case-card.tsx",
  ];

  for (const path of paths) {
    const source = readSource(path);
    assert.doesNotMatch(source, /role="button"/, `${path} 仍含嵌套伪按钮`);
    assert.match(source, /<(?:button|Button)\b/, `${path} 应提供原生键盘入口`);
  }
});

test("权限抽屉手机全宽且桌面固定为 480px", () => {
  const source = readSource("src/app/(app)/admin/permission-manager.tsx");
  assert.match(source, /w-full sm:w-\[480px\] sm:max-w-\[480px\]/);
  assert.doesNotMatch(source, /sm:max-w-none/);
});

test("语义状态色分别提供浅色与暗色对比色", () => {
  const source = readSource("src/lib/tailwind-utils.ts");
  assert.match(source, /text-\[#6FAA7D\][^\n]*dark:text-\[#6FAA7D\]/);
  assert.match(source, /text-\[#D99E55\][^\n]*dark:text-\[#D99E55\]/);
  assert.match(source, /text-\[#C9604D\][^\n]*dark:text-\[#C9604D\]/);
});

test("触屏与键盘都能看到卡片操作，当前选择会暴露给读屏", () => {
  const providers = readSource("src/app/(app)/admin/ai-config/components/providers-client.tsx");
  const rewrite = readSource("src/app/(app)/admin/ai-config/components/rewrite-client.tsx");
  const modules = readSource("src/app/(app)/admin/modules/modules-content-v2.tsx");
  const caseCard = readSource("src/app/(app)/video-review/components/case-card.tsx");

  for (const source of [providers, rewrite, modules]) {
    assert.match(source, /aria-current=/);
  }
  assert.match(providers, /opacity-100[^\n]*sm:opacity-0[^\n]*sm:group-focus-within:opacity-100/);
  assert.match(rewrite, /opacity-100[^\n]*sm:opacity-0[^\n]*sm:group-focus-within:opacity-100/);
  assert.match(modules, /pointer-events-auto[^\n]*sm:pointer-events-none[^\n]*sm:group-focus-within:pointer-events-auto/);
  assert.match(caseCard, /opacity-100[^\n]*sm:opacity-0[^\n]*sm:group-focus-within:opacity-100/);
});

test("默认展开的渠道第一次点击即可收起", () => {
  const source = readSource("src/app/(app)/admin/ai-config/components/providers-client.tsx");
  assert.match(source, /\[id\]: !\(prev\[id\] !== false\)/);
});

test("诊断脚本行使用单一原生按钮，不再嵌套互动控件", () => {
  const source = readSource("src/app/(app)/admin/content/content-diagnosis-workbench.tsx");
  const segmentStart = source.indexOf("scriptSegments.map");
  const segmentBlock = source.slice(segmentStart, source.indexOf("activeTab === \"analysis\"", segmentStart));
  assert.match(segmentBlock, /<button[\s\S]*aria-pressed=\{isQuoted\}/);
  assert.doesNotMatch(segmentBlock, /role="button"/);
  assert.equal((segmentBlock.match(/<button\b/g) ?? []).length, 1);
});

test("认证页持续动画遵循系统减少动效偏好", () => {
  const source = readSource("src/app/(auth)/_components/auth-shell.tsx");
  assert.match(source, /motion-safe:animate-ping/);
  assert.doesNotMatch(source, /(?<!motion-safe:)animate-ping/);
});

test("设置弹窗具备 dialog、Escape、焦点循环和手机端纵向布局", () => {
  const source = readSource("src/components/premium-settings-modal.tsx");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"[\s\S]*onOpenChange\(false\)/);
  assert.match(source, /event\.key !== "Tab"[\s\S]*first[\s\S]*last/);
  assert.match(source, /flex-col[^"]*sm:flex-row/);
  assert.match(source, /w-full[^"]*sm:w-52/);
  assert.doesNotMatch(source, /hidden space-y-3 sm:block[\s\S]*action=\{signOut\}/);
});

test("月度矩阵、案例行和选题卡不再嵌套互动控件", () => {
  const paths = [
    "src/app/(app)/admin/fulfillment/components/monthly-matrix.tsx",
    "src/app/(app)/violations/components/case-row.tsx",
    "src/components/topics/sub-topic-card.tsx",
  ];
  for (const path of paths) {
    assert.doesNotMatch(readSource(path), /role="button"/, `${path} 仍使用含子按钮的伪按钮`);
  }

  const monthly = readSource(paths[0]);
  const subTopic = readSource(paths[2]);
  assert.match(monthly, /aria-expanded=\{expanded\}/);
  assert.match(monthly, /aria-controls="monthly-matrix-panel"/);
  assert.match(subTopic, /aria-expanded=\{isExpanded\}/);
  assert.match(subTopic, /aria-controls=\{`sub-topic-details-/);
});

test("复制、删除与关闭操作在触屏和读屏上都可达", () => {
  const caseRow = readSource("src/app/(app)/violations/components/case-row.tsx");
  const modules = readSource("src/app/(app)/admin/modules/modules-content-v2.tsx");
  assert.match(caseRow, /opacity-100 sm:opacity-0[^"]*sm:group-focus-within:opacity-100/);
  assert.match(modules, /删除团队[\s\S]*opacity-100[^"]*sm:opacity-0[^"]*sm:group-focus-within:opacity-100/);
  assert.match(modules, /aria-label="关闭成员权限详情"/);
});

test("移动导航与工作账号菜单暴露展开状态并支持 Escape 返回焦点", () => {
  const nav = readSource("src/components/nav-bar-client.tsx");
  const workspace = readSource("src/components/workspace-picker.tsx");
  assert.match(nav, /aria-expanded=\{isMobileMenuOpen\}/);
  assert.match(nav, /aria-controls="mobile-navigation-menu"/);
  assert.match(nav, /event\.key !== "Escape"[\s\S]*mobileMenuButtonRef\.current\?\.focus\(\)/);
  assert.match(nav, /aria-label=\{`打开账号与设置：\$\{name\}`\}/);
  assert.equal((nav.match(/aria-current=\{active \? "page" : undefined\}/g) ?? []).length, 2);
  assert.match(nav, /motion-safe:animate-pulse/);
  assert.match(workspace, /type="button"[\s\S]*aria-expanded=\{isOpen\}[\s\S]*aria-controls=\{menuId\}/);
  assert.match(workspace, /event\.key !== "Escape"[\s\S]*triggerRef\.current\?\.focus\(\)/);
  assert.match(workspace, /role="group" aria-label="工作账号列表"/);
  assert.match(workspace, /aria-pressed=\{isSelected\}/);
});

test("认证页小号状态文字使用 AA 对比色", () => {
  const login = readSource("src/app/(auth)/login/login-form.tsx");
  const register = readSource("src/app/(auth)/register/register-form.tsx");
  const forgot = readSource("src/app/(auth)/forgot-password/forgot-password-form.tsx");
  assert.match(login, /text-\[#8F641B\][^"]*dark:text-\[#D99E55\]/);
  assert.match(register, /barColor: "#D99E55", textColor: "#8F641B"/);
  assert.match(register, /barColor: "#5F82A8", textColor: "#4E7194"/);
  assert.match(register, /barColor: "#6FAA7D", textColor: "#3F7A4E"/);
  assert.match(forgot, /bg-\[#6FAA7D\]\/10[^"]*text-\[#3F7A4E\]/);
});

test("成员权限详情使用可管理焦点的 Sheet，持续状态动画遵循减少动效偏好", () => {
  const modules = readSource("src/app/(app)/admin/modules/modules-content-v2.tsx");
  assert.match(modules, /<Sheet[\s\S]*open=\{activeMember !== null\}/);
  assert.match(modules, /<SheetContent[\s\S]*<SheetTitle>/);
  assert.match(modules, /<SheetDescription/);

  const motionPaths = [
    "src/app/(app)/dashboard/video-submit-panel.tsx",
    "src/app/(app)/violations/components/rank-board.tsx",
    "src/app/(app)/admin/fulfillment/components/stats-bar.tsx",
    "src/app/(app)/admin/content/content-diagnosis-workbench.tsx",
    "src/components/workspace-picker.tsx",
  ];
  for (const path of motionPaths) {
    const source = readSource(path);
    assert.doesNotMatch(source, /(?<!motion-safe:)animate-ping/, `${path} 仍有不受控的持续 ping 动画`);
  }
});
