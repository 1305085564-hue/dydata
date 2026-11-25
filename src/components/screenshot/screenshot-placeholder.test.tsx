import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ScreenshotImageView,
  ScreenshotPlaceholder,
  ScreenshotProbingPlaceholder,
} from "./screenshot-image";
import { onScreenshotFailureProbed, probeScreenshotFailureReason } from "./screenshot-image-state";

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

test("404 探测完成后的最终显示是原图已丢失，且没有重试字样", async () => {
  const reason = await probeScreenshotFailureReason("/api/submission-screenshots/file?path=missing", async () => new Response(null, { status: 404 }));
  const html = renderToStaticMarkup(<ScreenshotPlaceholder alt="历史截图" variant="stage" reason={onScreenshotFailureProbed(reason).reason} />);

  assert.match(html, /原图已丢失/);
  assert.doesNotMatch(html, /点击重试/);
});

test("网络异常探测完成后的最终显示保留重试入口", async () => {
  const reason = await probeScreenshotFailureReason("/api/submission-screenshots/file?path=network", async () => {
    throw new Error("network down");
  });
  const html = renderToStaticMarkup(<ScreenshotPlaceholder alt="网络异常截图" variant="stage" reason={onScreenshotFailureProbed(reason).reason} />);

  assert.match(html, /截图无法显示/);
  assert.match(html, /点击重试/);
});

test("5xx 探测完成后的最终显示保留重试入口", async () => {
  const reason = await probeScreenshotFailureReason("/api/submission-screenshots/file?path=server-error", async () => new Response(null, { status: 503 }));
  const html = renderToStaticMarkup(<ScreenshotPlaceholder alt="服务异常截图" variant="stage" reason={onScreenshotFailureProbed(reason).reason} />);

  assert.match(html, /截图无法显示/);
  assert.match(html, /点击重试/);
});

test("探测期间渲染浅砂色圆角骨架占位，不再留空白", () => {
  const stageHtml = renderToStaticMarkup(
    <ScreenshotProbingPlaceholder alt="流量曲线截图" variant="stage" className="min-h-[320px] w-full" />,
  );
  assert.match(stageHtml, /data-screenshot-probing="1"/);
  assert.match(stageHtml, /bg-\[#F1F1F0\]/);
  assert.match(stageHtml, /rounded-xl/);
  assert.match(stageHtml, /animate-pulse-claude/);
  assert.match(stageHtml, /min-h-\[320px\]/);
  assert.match(stageHtml, /加载中…/);

  const thumbHtml = renderToStaticMarkup(<ScreenshotProbingPlaceholder alt="基础数据截图" variant="thumb" />);
  assert.match(thumbHtml, /data-screenshot-probing="1"/);
  assert.match(thumbHtml, /bg-\[#F1F1F0\]/);
  assert.doesNotMatch(thumbHtml, />加载中…</);
});

test("最终占位与骨架保持一致的 rounded-xl 圆角，切态时不跳圆角", () => {
  const stageHtml = renderToStaticMarkup(<ScreenshotPlaceholder alt="大图" variant="stage" reason="missing" />);
  const panelHtml = renderToStaticMarkup(<ScreenshotPlaceholder alt="中图" variant="panel" reason="missing" />);

  assert.match(stageHtml, /rounded-xl/);
  assert.doesNotMatch(stageHtml, /rounded-(?:lg|md)/);
  assert.match(panelHtml, /rounded-xl/);
  assert.doesNotMatch(panelHtml, /rounded-(?:lg|md)/);
});

test("从骨架切到最终占位时，骨架淡出与丢失态淡入同步播放", () => {
  const html = renderToStaticMarkup(
    <ScreenshotPlaceholder alt="流量曲线截图" variant="stage" reason="missing" exitingSkeleton />,
  );
  assert.match(html, /data-screenshot-probing-exit="1"/);
  assert.match(html, /animate-out fade-out-0 duration-150/);
  assert.match(html, /animate-in fade-in-0 duration-150/);
});

test("状态机驱动 DOM 接线：首图加载、自动重试、探测态、最终占位各落到对应视图", () => {
  const initialHtml = renderToStaticMarkup(
    <ScreenshotImageView
      src="/api/submission-screenshots/file?path=demo"
      alt="流量曲线截图"
      variant="stage"
      status="loading"
      attempts={0}
      reason="unavailable"
      renderKey={0}
    />,
  );
  assert.match(initialHtml, /<img[^>]*src="\/api\/submission-screenshots\/file\?path=demo"/);
  assert.doesNotMatch(initialHtml, /data-screenshot-probing="1"/);
  assert.doesNotMatch(initialHtml, /data-screenshot-placeholder="1"/);

  const retryingHtml = renderToStaticMarkup(
    <ScreenshotImageView
      src="/api/submission-screenshots/file?path=demo"
      alt="流量曲线截图"
      variant="stage"
      status="retrying"
      attempts={1}
      reason="unavailable"
      renderKey={0}
    />,
  );
  assert.match(retryingHtml, /data-screenshot-probing="1"/);
  assert.doesNotMatch(retryingHtml, /<img/);
  assert.doesNotMatch(retryingHtml, /data-screenshot-placeholder="1"/);

  const retryFetchingHtml = renderToStaticMarkup(
    <ScreenshotImageView
      src="/api/submission-screenshots/file?path=demo"
      alt="流量曲线截图"
      variant="stage"
      status="loading"
      attempts={1}
      reason="unavailable"
      renderKey={1}
    />,
  );
  assert.match(retryFetchingHtml, /data-screenshot-probing="1"/);
  assert.match(retryFetchingHtml, /<img[^>]*class="sr-only pointer-events-none"/);
  assert.doesNotMatch(retryFetchingHtml, /data-screenshot-placeholder="1"/);

  const probingHtml = renderToStaticMarkup(
    <ScreenshotImageView
      src="/api/submission-screenshots/file?path=demo"
      alt="流量曲线截图"
      variant="stage"
      status="probing"
      attempts={1}
      reason="unavailable"
      renderKey={1}
    />,
  );
  assert.match(probingHtml, /data-screenshot-probing="1"/);
  assert.doesNotMatch(probingHtml, /<img/);

  const missingHtml = renderToStaticMarkup(
    <ScreenshotImageView
      src="/api/submission-screenshots/file?path=demo"
      alt="流量曲线截图"
      variant="stage"
      status="failed"
      attempts={1}
      reason="missing"
      renderKey={1}
      exitingSkeleton
    />,
  );
  assert.match(missingHtml, /data-screenshot-placeholder="1"/);
  assert.match(missingHtml, /data-screenshot-reason="missing"/);
  assert.match(missingHtml, /data-screenshot-probing-exit="1"/);
  assert.doesNotMatch(missingHtml, /点击重试/);
});
