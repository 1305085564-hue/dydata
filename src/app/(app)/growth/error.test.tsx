import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import GrowthError from "./error";

test("成长页加载失败时提供明确说明与重试入口", () => {
  const html = renderToStaticMarkup(
    <GrowthError error={new Error("network failed")} reset={() => {}} />,
  );

  assert.match(html, /成长数据加载失败/);
  assert.match(html, /重试/);
});
