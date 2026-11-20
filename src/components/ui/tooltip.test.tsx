import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

test("Tooltip 默认禁止悬停驻留、移出无延迟关闭，且浮层不拦截指针命中", () => {
  const rootEl = Tooltip({ children: null });
  assert.equal(rootEl.props.disableHoverablePopup, true);

  const triggerEl = TooltipTrigger({ children: "触发器" });
  assert.equal(triggerEl.props.delay, 100);
  assert.equal(triggerEl.props.closeDelay, 0);

  const html = renderToStaticMarkup(
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger>查看说明</TooltipTrigger>
        <TooltipContent>仅作展示的提示内容</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  // 浮层在开启渲染或结构声明上都不应带有退场动画，且 Positioner / Popup 均放行指针
  assert.doesNotMatch(html, /data-closed:animate-out/);
});

test("TooltipContent 声明 pointer-events-none 与即时关闭语义", () => {
  const popupTree = TooltipContent({ children: "提示" });
  const positioner = popupTree.props.children;
  assert.match(positioner.props.className, /\bpointer-events-none\b/);
  const popup = positioner.props.children;
  assert.match(popup.props.className, /\bpointer-events-none\b/);
  assert.doesNotMatch(popup.props.className, /data-closed:animate-out/);
});
