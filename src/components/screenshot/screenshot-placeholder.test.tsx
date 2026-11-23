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

test("明确 404（原图已丢失）时说实话，不再给「点击重试」的假承诺", () => {
  const html = renderToStaticMarkup(<ScreenshotPlaceholder alt="5 月投稿截图" variant="stage" reason="missing" />);

  assert.match(html, /data-screenshot-reason="missing"/);
  assert.match(html, /原图已丢失/);
  assert.match(html, /文件早已不存在/);
  assert.doesNotMatch(html, /点击重试/);
  assert.doesNotMatch(html, /role="button"/);
});

test("网络或服务异常时仍给重试入口，且不谎称原图已丢失", () => {
  const html = renderToStaticMarkup(<ScreenshotPlaceholder alt="今日截图" variant="stage" reason="unavailable" />);

  assert.match(html, /data-screenshot-reason="unavailable"/);
  assert.match(html, /截图无法显示/);
  assert.match(html, /点击重试/);
  assert.doesNotMatch(html, /原图已丢失/);
  assert.match(html, /role="button"/);
});
