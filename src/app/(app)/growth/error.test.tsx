import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import GrowthError from "./error";

test("成长页加载失败时提供明确说明与重试入口", () => {
  const html = renderToStaticMarkup(
    <GrowthError error={new Error("network failed")} reset={() => {}} />,
  );

  assert.match(html, /成长轨迹暂时未能展开/);
  assert.match(html, /重试/);
});
