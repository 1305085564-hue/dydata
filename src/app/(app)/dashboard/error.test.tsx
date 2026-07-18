import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardError from "./error";

test("dashboard 加载失败时提供明确说明与重试入口", () => {
  const html = renderToStaticMarkup(
    <DashboardError error={new Error("network failed")} reset={() => {}} />,
  );

  assert.match(html, /数据台加载失败/);
  assert.match(html, /重试/);
});
