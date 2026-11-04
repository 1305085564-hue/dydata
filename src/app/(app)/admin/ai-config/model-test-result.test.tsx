import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelTestFeedback, modelTestKey } from "./components/model-test-feedback";

test("失败探测常驻显示本次结果和原因，不冒充渠道历史健康", () => {
  const html = renderToStaticMarkup(<ModelTestFeedback result={{ ok: false, message: "HTTP 404: 当前渠道不支持该模型" }} />);
  assert.match(html, /本次测试未通过/);
  assert.match(html, /HTTP 404: 当前渠道不支持该模型/);
  assert.match(html, /role="status"/);
});

test("成功、未知原因和未测试分别呈现真实结果", () => {
  assert.match(renderToStaticMarkup(<ModelTestFeedback result={{ ok: true, latencyMs: 745 }} />), /本次测试通过 · 745ms/);
  assert.match(renderToStaticMarkup(<ModelTestFeedback result={{ ok: false }} />), /未返回原因/);
  assert.equal(renderToStaticMarkup(<ModelTestFeedback />), "");
});

test("同一模型在不同渠道的测试结果独立存放", () => {
  assert.notEqual(modelTestKey("channel-a", "same-model"), modelTestKey("channel-b", "same-model"));
});
