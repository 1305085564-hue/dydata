import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ItemHeading } from "@/components/ui/item-heading";

const readComponent = (name: string) =>
  readFileSync(resolve(process.cwd(), `src/components/ui/${name}.tsx`), "utf8");

/**
 * 这几条值锁原本长在页面文案测试里（页面自己写死样式时，锁页面即可）。
 * 页面改用共享组件之后，锁必须跟着落到组件上——否则组件内部被改坏，
 * 没有任何测试会红，页面测试只会继续替组件"背书"。
 */

test("Card 保持业务卡片主容器规格：白底 + 发丝环 + 12px 圆角", () => {
  const card = readComponent("card");
  assert.match(card, /"bg-white shadow-card-ring"/);
  assert.match(card, /rounded-xl/);
});

test("SectionHeading 保持章节定名规格：18px / 500 / #141413", () => {
  const section = readComponent("section-heading");
  assert.match(
    section,
    /"text-\[18px\] leading-\[1\.30\] font-medium text-\[#141413\]"/,
  );
});

test("ItemHeading 保持条目定名规格，降级只降墨度不降字号字重", () => {
  const item = readComponent("item-heading");
  assert.match(item, /"text-\[14px\] leading-\[1\.40\] font-medium"/);
  assert.match(item, /muted \? "text-\[#78716C\]" : "text-\[#1F1E1D\]"/);
});

test("EmptyState 保持空状态唯一形态：标题 14px/500/正文墨，描述 13px/辅助墨", () => {
  const emptyState = readComponent("empty-state");
  assert.match(emptyState, /"text-\[14px\] font-medium text-\[#1F1E1D\]"/);
  assert.match(emptyState, /max-w-\[240px\] text-\[13px\] text-\[#78716C\]/);
  assert.match(emptyState, /variant\?: "default" \| "compact"/);
});

/**
 * 上面三条只锁源码字符串——源码写对了但渲染分支接错，它们不会红。
 * 这条真渲染一次：确认 `muted` 真的只降墨度，不降字号/字重。
 */
test("ItemHeading 的 muted 真实渲染：降墨度、不降字号字重", () => {
  const normal = renderToStaticMarkup(
    createElement(ItemHeading, { as: "span" }, "张三"),
  );
  const muted = renderToStaticMarkup(
    createElement(ItemHeading, { as: "span", muted: true }, "张三"),
  );

  assert.match(normal, /text-\[#1F1E1D\]/);
  assert.doesNotMatch(normal, /text-\[#78716C\]/);

  assert.match(muted, /text-\[#78716C\]/);
  assert.doesNotMatch(muted, /text-\[#1F1E1D\]/);
  assert.match(muted, /text-\[14px\]/);
  assert.match(muted, /font-medium/);
  assert.match(muted, /<span/);
});
