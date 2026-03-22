import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { MotionCard } from "./motion-card";

test("MotionCard 渲染基础卡片结构与默认 class", () => {
  const html = renderToStaticMarkup(
    <MotionCard>
      <div>内容</div>
    </MotionCard>,
  );

  assert.match(html, /内容/);
  assert.match(html, /glass-card/);
  assert.match(html, /data-slot=\"card\"/);
});

test("MotionCard 支持静态模式和自定义 className", () => {
  const html = renderToStaticMarkup(
    <MotionCard hover={false} className="custom-card">
      <div>内容</div>
    </MotionCard>,
  );

  assert.match(html, /glass-card-static/);
  assert.match(html, /custom-card/);
});
