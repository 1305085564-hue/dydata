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

  assert.match(html, /数据台/);
  assert.doesNotMatch(html, /今日流程/);
  assert.doesNotMatch(html, /审核中心/);
  assert.doesNotMatch(html, /全域矩阵/);
  assert.doesNotMatch(html, /选题策划/);
  assert.doesNotMatch(html, /脚本创作/);
  assert.doesNotMatch(html, /成片审核/);
  assert.doesNotMatch(html, /去审核/);
});

test("不传 accounts 时仅渲染日期按钮，不破坏既合调用方", () => {
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
