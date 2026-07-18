import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import FulfillmentError from "./error";

test("履约页加载失败时提供明确说明与重试入口", () => {
  const html = renderToStaticMarkup(
    <FulfillmentError error={new Error("network failed")} reset={() => {}} />,
  );

  assert.match(html, /发布管理加载失败/);
  assert.match(html, /重试/);
});
