import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { DashboardWorkspaceHeader } from "./dashboard-workspace-header";

test("dashboard 顶部只保留主工作台信息，不再渲染流程与工作区切换整排", () => {
  const html = renderToStaticMarkup(
    <DashboardWorkspaceHeader
      today="2026-05-24"
      activeBizDate="2026-05-24"
      onDateChange={() => {}}
      onDashboardAction={() => {}}
      hasPendingExemption={false}
      submittedDates={[]}
    />,
  );

  assert.match(html, /今日工作台/);
  assert.doesNotMatch(html, /今日流程/);
  assert.doesNotMatch(html, /审核中心/);
  assert.doesNotMatch(html, /全域矩阵/);
  assert.doesNotMatch(html, /选题策划/);
  assert.doesNotMatch(html, /脚本创作/);
  assert.doesNotMatch(html, /成片审核/);
  assert.doesNotMatch(html, /去审核/);
});

test("单账号也显示为可点账号按钮，浮层 props 不触发空态", () => {
  const html = renderToStaticMarkup(
    <DashboardWorkspaceHeader
      today="2026-05-31"
      activeBizDate="2026-05-31"
      onDateChange={() => {}}
      onDashboardAction={() => {}}
      hasPendingExemption={false}
      submittedDates={[]}
      accounts={[{ id: "a1", name: "抖音-阿禅", display_name: "抖音-阿禅", content_direction: "财经" }]}
      selectedAccountId="a1"
      onSelectedAccountChange={() => {}}
    />,
  );

  assert.match(html, /抖音-阿禅/);
  assert.match(html, /aria-haspopup="listbox"/);
  // 账号按钮在日期之前出现
  const accountIdx = html.indexOf("抖音-阿禅");
  const dateIdx = html.indexOf("2026-05-31");
  assert.ok(accountIdx > 0 && dateIdx > 0);
  assert.ok(accountIdx < dateIdx, "账号按钮应在日期按钮之前渲染");
});

test("不传 accounts 时仅渲染日期按钮，不破坏既有调用方", () => {
  const html = renderToStaticMarkup(
    <DashboardWorkspaceHeader
      today="2026-05-31"
      activeBizDate="2026-05-31"
      onDateChange={() => {}}
      onDashboardAction={() => {}}
      hasPendingExemption={false}
      submittedDates={[]}
    />,
  );

  assert.doesNotMatch(html, /aria-haspopup="listbox"/);
  assert.match(html, /2026-05-31/);
});
