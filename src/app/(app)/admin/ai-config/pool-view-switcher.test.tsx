import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PoolViewSwitcher } from "./components/pool-view-switcher";

test("PoolViewSwitcher 渲染两个对等药丸：'模型视角'与'渠道视角'，且不含'供给管理'", () => {
  const html = renderToStaticMarkup(
    <PoolViewSwitcher viewMode="model" onChange={() => {}} />
  );

  assert.match(html, /模型视角/);
  assert.match(html, /渠道视角/);
  assert.doesNotMatch(html, /供给管理/);
  assert.match(html, /aria-label="切换至模型视角"/);
  assert.match(html, /aria-label="切换至渠道视角"/);
});

test("PoolViewSwitcher 正确反映当前选中的视角", () => {
  const modelHtml = renderToStaticMarkup(
    <PoolViewSwitcher viewMode="model" onChange={() => {}} />
  );
  assert.match(modelHtml, /aria-selected="true"[^>]*>模型视角/);

  const channelHtml = renderToStaticMarkup(
    <PoolViewSwitcher viewMode="channel" onChange={() => {}} />
  );
  assert.match(channelHtml, /aria-selected="true"[^>]*>渠道视角/);
});
