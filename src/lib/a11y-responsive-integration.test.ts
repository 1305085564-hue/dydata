import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getNavGroups } from "@/components/nav-bar-items";
import { getMobileDirectTabs, isMobileMoreActive } from "@/components/mobile-tab-bar";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("含子控件的卡片不再把外层伪装成按钮", () => {
  const paths = [
    "src/app/(app)/admin/ai-config/components/providers-client.tsx",
    "src/app/(app)/admin/ai-config/components/rewrite-client.tsx",
    "src/app/(app)/admin/content/content-list.tsx",
    "src/app/(app)/dashboard/history-list.tsx",
  ];

  for (const path of paths) {
    const source = readSource(path);
    assert.doesNotMatch(source, /role="button"/, `${path} 仍含嵌套伪按钮`);
    assert.match(source, /<(?:button|Button)\b/, `${path} 应提供原生键盘入口`);
  }
});

test("语义状态色分别提供浅色与暗色对比色", () => {
  const source = readSource("src/lib/tailwind-utils.ts");
  assert.match(source, /text-\[#6FAA7D\][^\n]*dark:text-\[#6FAA7D\]/);
  assert.match(source, /text-\[#B98A54\][^\n]*dark:text-\[#B98A54\]/);
  assert.match(source, /text-\[#C9604D\][^\n]*dark:text-\[#C9604D\]/);
});

test("触屏与键盘都能看到卡片操作，当前选择会暴露给读屏", () => {
  const providers = readSource("src/app/(app)/admin/ai-config/components/providers-client.tsx");
  const rewrite = readSource("src/app/(app)/admin/ai-config/components/rewrite-client.tsx");
  const modules = readSource("src/app/(app)/admin/modules/modules-content-v3.tsx");

  assert.match(providers, /aria-label={`启用分组 \$\{keyItem\.label\}`}/);
  assert.match(rewrite, /aria-current=\{isViewActive \? "true" : undefined\}/);
  assert.match(modules, /aria-selected=\{memberView === "active"\}/);
  assert.match(
    modules,
    /aria-selected=\{memberView === "archived"\}/,
  );
  assert.match(rewrite, /opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100/);
});

test("服务商与 Key 开关提供可读标签", () => {
  const source = readSource("src/app/(app)/admin/ai-config/components/providers-client.tsx");
  const dialogs = readSource("src/app/(app)/admin/ai-config/components/providers-dialogs.tsx");
  assert.match(dialogs, /aria-label="是否启用渠道"/);
  assert.match(source, /aria-label={`启用分组 \$\{keyItem\.label\}`}/);
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

test("月度矩阵不再嵌套互动控件", () => {
  const paths = [
    "src/app/(app)/admin/fulfillment/components/monthly-matrix.tsx",
  ];
  for (const path of paths) {
    assert.doesNotMatch(readSource(path), /role="button"/, `${path} 仍使用含子按钮的伪按钮`);
  }

  const monthly = readSource(paths[0]);
  assert.match(monthly, /aria-expanded=\{expanded\}/);
  assert.match(monthly, /aria-controls="monthly-matrix-panel"/);
});

test("复制、删除与关闭操作在触屏和读屏上都可达", () => {
  const modules = readSource("src/app/(app)/admin/modules/modules-content-v3.tsx");
  assert.match(modules, /title="删除空团队"/);
  assert.match(modules, /onClick=\{\(\) => setDeleteTeamTarget\(team\)\}/);
  assert.match(modules, /aria-label="关闭成员权限详情"/);
});

test("移动导航与工作账号菜单暴露展开状态并支持 Escape 返回焦点", () => {
  const nav = readSource("src/components/nav-bar-client.tsx");
  const tabBar = readSource("src/components/mobile-tab-bar.tsx");
  const persona = readSource("src/components/user-workspace-popover.tsx");
  const workspace = readSource("src/components/workspace-picker.tsx");
  assert.match(tabBar, /aria-expanded=\{isMoreOpen\}/);
  assert.match(tabBar, /aria-controls="mobile-navigation-menu"/);
  assert.match(nav, /aria-label="行动中枢：待办、审批与风险"/);
  assert.equal((nav.match(/aria-current=\{isGroupActive \? "page" : undefined\}/g) ?? []).length, 1);
  assert.match(persona, /aria-expanded=\{isOpen\}/);
  assert.match(persona, /aria-controls=\{menuId\}/);
  assert.match(workspace, /type="button"[\s\S]*aria-expanded=\{isOpen\}[\s\S]*aria-controls=\{menuId\}/);
  assert.match(workspace, /event\.key !== "Escape"[\s\S]*triggerRef\.current\?\.focus\(\)/);
  assert.match(workspace, /role="group" aria-label="工作账号列表"/);
  assert.match(workspace, /aria-pressed=\{isSelected\}/);
});

test("认证页小号状态文字使用 AA 对比色", () => {
  const login = readSource("src/app/(auth)/login/login-form.tsx");
  const register = readSource("src/app/(auth)/register/register-form.tsx");
  const forgot = readSource("src/app/(auth)/forgot-password/forgot-password-form.tsx");
  assert.match(login, /text-\[#8F641B\][^"]*dark:text-\[#B98A54\]/);
  assert.match(register, /barColor: "#B98A54", textColor: "#8F641B"/);
  assert.match(register, /barColor: "#43718E", textColor: "#355B72"/);
  assert.match(register, /barColor: "#6FAA7D", textColor: "#3F7A4E"/);
  assert.match(forgot, /bg-\[#6FAA7D\]\/10[^"]*text-\[#1C1917\]/);
});

test("成员权限详情使用可管理焦点的 Sheet，持续状态动画遵循减少动效偏好", () => {
  const modules = readSource("src/app/(app)/admin/modules/modules-content-v3.tsx");
  assert.match(modules, /<Sheet[\s\S]*open=\{activeMember !== null\}/);
  assert.match(modules, /<SheetContent[\s\S]*<SheetTitle\b/);
  assert.match(modules, /<SheetDescription/);

  const motionPaths = [
    "src/app/(app)/dashboard/video-submit-panel-v2.tsx",
    "src/app/(app)/admin/fulfillment/components/stats-bar.tsx",
    "src/app/(app)/admin/content/content-diagnosis-workbench.tsx",
    "src/components/workspace-picker.tsx",
  ];
  for (const path of motionPaths) {
    const source = readSource(path);
    assert.doesNotMatch(source, /(?<!motion-safe:)animate-ping/, `${path} 仍有不受控的持续 ping 动画`);
  }
});

test("移动端双模外壳使用 navGroups 唯一数据源并支持 Escape 焦点返回与 a11y 关联", () => {
  const nav = readSource("src/components/nav-bar-client.tsx");
  const tabbar = readSource("src/components/mobile-tab-bar.tsx");
  const drawer = readSource("src/components/mobile-more-drawer.tsx");

  assert.match(nav, /<MobileTabBar[\s\S]*navGroups=\{navGroups\}/);
  assert.match(nav, /tabBarMoreButtonRef\.current\?\.focus\(\)/);
  assert.match(drawer, /id="mobile-navigation-menu"/);
  assert.match(drawer, /<AdaptiveSheetTitle/);
  assert.match(drawer, /<AdaptiveSheetDescription/);
  assert.match(tabbar, /aria-controls="mobile-navigation-menu"/);
  assert.match(tabbar, /aria-expanded=\{isMoreOpen\}/);
  assert.match(tabbar, /min-h-\[44px\]/);
});

test("AdaptiveSheet 具备真实 Touch 下拉手势与减少动效支持", () => {
  const sheet = readSource("src/components/ui/adaptive-sheet.tsx");
  assert.match(sheet, /onTouchStart=\{handleTouchStart\}/);
  assert.match(sheet, /onTouchMove=\{handleTouchMove\}/);
  assert.match(sheet, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(sheet, /motion-reduce:duration-0 motion-reduce:transition-none/);
  assert.match(sheet, /data-slot="adaptive-sheet-content"/);
});

test("移动端底栏快捷入口与更多高亮逻辑覆盖 4 个核心路由", () => {
  const navGroups = getNavGroups({
    showAdmin: true,
    showAiCopywriting: true,
    showSystemSettings: true,
    canAccessTeamManagement: true,
  });

  const directTabs = getMobileDirectTabs(navGroups);

  // 1. /content-tools/rewrite 激活“文案改写”直接入口，不激活“更多”
  const rewriteTab = directTabs.find((t) => t.href === "/content-tools/rewrite");
  assert.ok(rewriteTab, "文案改写应为直接快捷入口");
  assert.equal(rewriteTab.isActive("/content-tools/rewrite"), true);
  assert.equal(isMobileMoreActive(directTabs, "/content-tools/rewrite"), false);

  // 2. /admin/content 属于内容创作分组的其它子路由，不能误高亮“文案改写”，必须激活“更多”
  assert.equal(rewriteTab.isActive("/admin/content"), false);
  assert.equal(directTabs.some((t) => t.isActive("/admin/content")), false);
  assert.equal(isMobileMoreActive(directTabs, "/admin/content"), true);

  // 3. /growth 激活“成长分析”直接入口，不激活“更多”
  const growthTab = directTabs.find((t) => t.href === "/growth");
  assert.ok(growthTab, "成长分析应为直接快捷入口");
  assert.equal(growthTab.isActive("/growth"), true);
  assert.equal(isMobileMoreActive(directTabs, "/growth"), false);

  // 4. /admin/collaboration 属于数据中心的其它子路由，不能误高亮“成长分析”，必须激活“更多”
  assert.equal(growthTab.isActive("/admin/collaboration"), false);
  assert.equal(directTabs.some((t) => t.isActive("/admin/collaboration")), false);
  assert.equal(isMobileMoreActive(directTabs, "/admin/collaboration"), true);
});

test("成长分析排行榜在移动端提供同信息量无横滑卡片流与 >=44px 触控热区", () => {
  const source = readSource("src/components/leaderboard/leaderboard.tsx");
  assert.match(source, /hidden md:block[\s\S]*<Table/);
  assert.match(source, /block md:hidden/);
  assert.match(source, /min-h-\[44px\]/);
  assert.match(source, /RankBadge/);
  assert.match(source, /TagStack/);
});

test("NavBarClient 在 >=768px 严格保持原版桌面导航，移动端顶底去重并由底部胶囊TabBar接管", () => {
  const source = readSource("src/components/nav-bar-client.tsx");
  // 1. 移动端组件严格包裹在 block md:hidden
  assert.match(source, /<div className="block md:hidden">\s*<MobileTabBar/);
  assert.match(source, /<MobileMoreDrawer[\s\S]*open=\{isMobileDrawerOpen\}/);

  // 2. 移动端顶栏完成去重：不再保留冗余的汉堡下拉菜单，由悬浮胶囊底栏与抽屉承载
  assert.doesNotMatch(source, /mobileMenuButtonRef/);
  assert.doesNotMatch(source, /setIsMobileMenuOpen/);

  // 3. 桌面/平板数字徽章与高度保持规范
  assert.match(source, /bellBadgeCount > 99 \? "99\+" : bellBadgeCount/);
  assert.match(source, /py-2\.5/);
});

test("第一批员工端关键交互实体在移动端满足 >=44px 触控热区", () => {
  // 1. Dashboard 关键控件
  const header = readSource("src/app/(app)/dashboard/components/dashboard-workspace-header.tsx");
  const exemption = readSource("src/app/(app)/dashboard/components/quick-exemption-button.tsx");
  const slots = readSource("src/components/submission/截图槽位区.tsx");
  assert.match(header, /min-h-\[44px\]/);
  assert.match(exemption, /min-h-\[44px\]/);
  assert.match(slots, /min-h-\[44px\]/);

  // 2. Topics 关键控件
  const topicHub = readSource("src/components/topics-v2/TopicHubV2.tsx");
  const pool = readSource("src/components/topics-v2/TopicPoolExplorer.tsx");
  const breakdown = readSource("src/components/topics-v2/TopicWorkBreakdownDrawer.tsx");
  assert.match(topicHub, /min-h-\[44px\]/);
  assert.match(pool, /min-h-\[44px\]/);
  assert.match(breakdown, /min-h-\[44px\]/);

  // 3. Rewrite 关键控件
  const chatInspector = readSource("src/components/content-tools/rewrite-v3/ChatInspector.tsx");
  const skillCabin = readSource("src/components/content-tools/rewrite-v3/SkillCabin.tsx");
  const settingsDrawer = readSource("src/components/content-tools/rewrite-v3/SettingsDrawer.tsx");
  const canvas = readSource("src/components/content-tools/rewrite-v3/CalmStudioCanvas.tsx");
  assert.match(chatInspector, /min-h-\[44px\]/);
  assert.match(skillCabin, /min-h-\[44px\]/);
  assert.match(settingsDrawer, /min-h-\[44px\]/);
  assert.match(canvas, /min-h-\[44px\]/);
});

test("growth 骨架屏与图表面板具备 min-w-0 max-w-full 与自适应宽度，防止初始加载横向溢出", () => {
  const radar = readSource("src/components/growth/六维雷达面板.tsx");
  const growthClient = readSource("src/app/(app)/growth/growth-client.tsx");
  const resultTrend = readSource("src/components/charts/result-trend.tsx");
  const interactionTrend = readSource("src/components/charts/interaction-trend.tsx");

  // 雷达图在 320px 下净宽 288px，必须自适应不超过 280px 且图例可换行
  assert.match(radar, /max-w-\[280px\] sm:max-w-\[320px\]/);
  assert.match(radar, /flex-wrap/);

  // 骨架屏与图表包裹层必须带 min-w-0 max-w-full
  assert.match(growthClient, /w-full min-w-0 max-w-full/);
  assert.match(resultTrend, /min-w-0 max-w-full/);
  assert.match(interactionTrend, /min-w-0 max-w-full/);
});
