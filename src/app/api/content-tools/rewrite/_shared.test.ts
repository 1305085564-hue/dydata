import assert from "node:assert/strict";
import test from "node:test";

import {
  toApiErrorResponse,
  toApiErrorStatus,
  toOptionalNullableString,
} from "./_shared";

test("错误码映射覆盖联调关键场景", () => {
  assert.equal(toApiErrorStatus("未登录"), 401);
  assert.equal(toApiErrorStatus("用户信息不存在"), 403);
  assert.equal(toApiErrorStatus("会话不存在"), 404);
  assert.equal(toApiErrorStatus("文案改写功能已关闭"), 503);
  assert.equal(toApiErrorStatus("文案改写数据表未就绪，请先执行 044 / 045 / 046 migration"), 503);
  assert.equal(toApiErrorStatus("未配置输出长度预设"), 503);
  assert.equal(toApiErrorStatus("服务端 Supabase 配置缺失"), 503);
  assert.equal(toApiErrorStatus("缺少 message"), 400);
  assert.equal(toApiErrorStatus("请求体格式不正确"), 400);
  assert.equal(toApiErrorStatus("模式不存在"), 400);
  assert.equal(toApiErrorStatus("会话 ID 格式不正确"), 400);
});

test("错误响应返回稳定 error 字段和对应状态码", async () => {
  const response = toApiErrorResponse(new Error("会话不存在"), "兜底错误");
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, { error: "会话不存在" });
});

test("schema cache 裸错误会被转换成稳定的 migration 提示", async () => {
  const response = toApiErrorResponse(
    new Error("Could not find the table 'public.rewrite_model_views' in the schema cache"),
    "兜底错误",
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    error: "文案改写数据表未就绪，请先执行 044 / 045 / 046 migration",
  });
});

test("可选字符串解析会保留 undefined/null 语义", () => {
  assert.equal(toOptionalNullableString(undefined), undefined);
  assert.equal(toOptionalNullableString(null), null);
  assert.equal(toOptionalNullableString("  abc  "), "abc");
});

test("uuid 裸错误会被转换成稳定的入参提示", async () => {
  const response = toApiErrorResponse(
    new Error('invalid input syntax for type uuid: "not-a-real-id"'),
    "兜底错误",
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    error: "会话 ID 格式不正确",
  });
});
