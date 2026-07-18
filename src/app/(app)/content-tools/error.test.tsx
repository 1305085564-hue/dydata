import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ContentToolsError from "./error";

test("内容工具页加载失败时提供明确说明与重试入口", () => {
  const html = renderToStaticMarkup(
    <ContentToolsError error={new Error("network failed")} reset={() => {}} />,
  );

  assert.match(html, /内容工具加载失败/);
  assert.match(html, /重试/);
});
