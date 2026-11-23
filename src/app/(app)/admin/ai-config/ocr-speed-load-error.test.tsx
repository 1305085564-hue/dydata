import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OcrSpeedLoadError, requestOcrSpeedLogs } from "./components/ocr-speed-drawer";

async function renderedRequestError(fetcher: typeof fetch) {
  const result = await requestOcrSpeedLogs(fetcher);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("预期请求失败");
  return renderToStaticMarkup(<OcrSpeedLoadError message={result.error} />);
}

test("网络中断显示网络异常和重试指引", async () => {
  const markup = await renderedRequestError(async () => {
    throw new TypeError("Failed to fetch");
  });

  assert.match(markup, /role="alert"/);
  assert.match(markup, /网络连接异常，无法加载测速数据，请检查网络后重试。/);
});

test("接口 403 显示权限错误，不压成通用加载失败", async () => {
  const markup = await renderedRequestError(async () => Response.json({ error: "无权限" }, { status: 403 }));

  assert.match(markup, /无权限/);
  assert.doesNotMatch(markup, /加载测速数据失败/);
});

test("接口 5xx 显示安全错误文案和请求编号", async () => {
  const markup = await renderedRequestError(async () => Response.json({
      error: "后台服务暂时不可用，稍后重试（编号：req-ocr-502）",
      requestId: "req-ocr-502",
    }, { status: 502 }));

  assert.match(markup, /后台服务暂时不可用，稍后重试（编号：req-ocr-502）/);
  assert.doesNotMatch(markup, /database|SQL|加载测速数据失败/);
});

test("接口 5xx 未返回可读错误正文时显示状态码和服务重试指引", async () => {
  const markup = await renderedRequestError(async () => new Response("upstream unavailable", { status: 503 }));

  assert.match(markup, /后台服务暂时不可用（HTTP 503），请稍后重试。/);
});

test("接口 404 显示请求未找到，不误报为网络中断", async () => {
  const markup = await renderedRequestError(async () => new Response(null, { status: 404 }));

  assert.match(markup, /测速台账请求失败（HTTP 404）。/);
  assert.doesNotMatch(markup, /网络连接异常/);
});
