import assert from "node:assert/strict";
import test from "node:test";
import { AppError, toErrorResponse } from "./errors";
import { createRequestContext } from "./request-context";

test("AppError 保留稳定错误码并映射状态", () => {
  const error = new AppError({ code: "TIMEOUT", message: "internal timeout", publicMessage: "请求超时" });
  assert.equal(error.status, 504);
  assert.equal(error.publicMessage, "请求超时");
});

test("AppError 未显式传公开文案时使用 code 白名单文案", () => {
  const error = new AppError({ code: "RPC_FAILED", message: "select * from private_table" });
  assert.equal(error.publicMessage, "补交申请处理失败，请稍后重试");
});

test("错误响应只返回公开文案和 requestId", async () => {
  const context = createRequestContext({ route: "/api/test", operation: "read" });
  const response = toErrorResponse(new Error("secret sql"), context);
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-dydata-request-id"), context.requestId);
  assert.deepEqual(await response.json(), { error: { code: "INTERNAL_ERROR", message: "请求处理失败", requestId: context.requestId } });
});
