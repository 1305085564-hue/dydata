import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ScreenshotPlaceholder } from "./screenshot-image";

test("大图占位显示『截图无法显示』并提供重试入口", () => {
  const html = renderToStaticMarkup(<ScreenshotPlaceholder alt="流量曲线截图" variant="stage" />);

  assert.match(html, /data-screenshot-placeholder="1"/);
  assert.match(html, /截图无法显示/);
  assert.match(html, /点击重试/);
  assert.match(html, /role="button"/);
});

test("占位文案只描述状态，不断言原因（避免把网络抖动说成图片已被删除）", () => {
  const html = renderToStaticMarkup(<ScreenshotPlaceholder alt="留存脱落截图" variant="stage" />);

  assert.doesNotMatch(html, /已过期/);
  assert.doesNotMatch(html, /已被删除/);
  assert.doesNotMatch(html, /不存在/);
});

test("缩略图占位只放图标，文案退到 title/aria-label（32px 塞不下文字）", () => {
  const html = renderToStaticMarkup(<ScreenshotPlaceholder alt="基础数据截图" variant="thumb" />);

  assert.match(html, /aria-label="基础数据截图：截图无法显示"/);
  assert.doesNotMatch(html, />截图无法显示</);
  assert.doesNotMatch(html, /role="button"/);
});
