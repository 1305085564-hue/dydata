import assert from "node:assert/strict";
import test from "node:test";

import { getApiFailureMessage } from "./api-failure-message";

const fallback = "请求没能完成";

test("无响应和网络异常统一提示网络连接异常", async () => {
  assert.equal(await getApiFailureMessage(undefined, fallback), "网络连接异常，请检查网络后重试。");
});

test("401 明确提示登录状态失效，即使服务端带有其他 error", async () => {
  assert.equal(
    await getApiFailureMessage(Response.json({ error: "token expired" }, { status: 401 }), fallback),
    "登录状态已失效，请刷新页面或重新登录。",
  );
});

test("403 和 429 优先透传标准 error，没有时使用场景兜底", async () => {
  assert.equal(await getApiFailureMessage(Response.json({ error: "当前账号不能看这个模块" }, { status: 403 }), fallback), "当前账号不能看这个模块");
  assert.equal(await getApiFailureMessage(new Response(null, { status: 403 }), fallback), "当前账号无权限执行此操作。");
  assert.equal(await getApiFailureMessage(Response.json({ error: "稍后再试" }, { status: 429 }), fallback), "稍后再试");
  assert.equal(await getApiFailureMessage(new Response(null, { status: 429 }), fallback), "操作过于频繁，请稍后再试。");
});

test("5xx 保留安全服务端文案，否则带 HTTP 状态码", async () => {
  assert.equal(await getApiFailureMessage(Response.json({ error: "后台繁忙（编号：req-500）", details: "SQL secret" }, { status: 500 }), fallback), "后台繁忙（编号：req-500）");
  assert.equal(await getApiFailureMessage(new Response("upstream", { status: 503 }), fallback), "后台服务暂时不可用（HTTP 503），请稍后重试。");
});

test("其他非 2xx、非 JSON 和成功响应无法读取时使用安全兜底", async () => {
  assert.equal(await getApiFailureMessage(new Response(null, { status: 404 }), fallback), "请求没能完成（HTTP 404）。");
  assert.equal(await getApiFailureMessage(Response.json({ message: "不要展示我" }, { status: 400 }), fallback), "请求没能完成（HTTP 400）。");
  assert.equal(await getApiFailureMessage(new Response("not-json", { status: 200 }), fallback), "返回数据无法读取，请稍后重试。");
});

test("500 没有标准 error 时只显示状态码，不泄露调试字段", async () => {
  assert.equal(
    await getApiFailureMessage(Response.json({ message: "SQL connection failed", details: "stack trace", hint: "secret" }, { status: 500 }), fallback),
    "后台服务暂时不可用（HTTP 500），请稍后重试。",
  );
});

test("标准 error 必须是非空字符串，其他类型与空文案都使用安全兜底", async () => {
  for (const error of [null, 42, {}, ["database error"], "", "  " ]) {
    assert.equal(
      await getApiFailureMessage(Response.json({ error }, { status: 403 }), fallback),
      "当前账号无权限执行此操作。",
    );
  }
});

test("404 和其他业务拒绝保留标准 error 中的原因与编号", async () => {
  assert.equal(
    await getApiFailureMessage(Response.json({ error: "找不到该记录（编号：req-404）" }, { status: 404 }), fallback),
    "找不到该记录（编号：req-404）",
  );
  assert.equal(
    await getApiFailureMessage(Response.json({ error: "请先选择月份" }, { status: 400 }), fallback),
    "请先选择月份",
  );
});

test("非 JSON 失败响应显示场景和状态码，正文不能成为提示", async () => {
  assert.equal(
    await getApiFailureMessage(new Response("<html>private upstream debug</html>", { status: 404 }), fallback),
    "请求没能完成（HTTP 404）。",
  );
});
