import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { VideoReviewLoadError } from "./video-review-workbench";

test("视频复盘数据失败时只显示错误说明和重试，不显示误导性的零指标", () => {
  const html = renderToStaticMarkup(
    <VideoReviewLoadError message="接口不可用" onRetry={() => {}} />,
  );

  assert.match(html, /数据加载失败/);
  assert.match(html, /接口不可用/);
  assert.match(html, /重新加载/);
  assert.doesNotMatch(html, /今日目标/);
});
