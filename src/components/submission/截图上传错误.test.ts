import test from "node:test";
import assert from "node:assert/strict";

import {
  NETWORK_RETRY_MESSAGE,
  OCR_FAIL_MESSAGE,
  toSlotUploadErrorMessage,
} from "./截图上传错误";

test("网络异常映射为可重试文案", () => {
  const error = new TypeError("Failed to fetch");
  assert.equal(toSlotUploadErrorMessage(error), NETWORK_RETRY_MESSAGE);
});

test("登录失效错误保持原文案", () => {
  const error = new Error("登录状态已失效，请刷新页面后重试");
  assert.equal(toSlotUploadErrorMessage(error), "登录状态已失效，请刷新页面后重试");
});

test("其他识别异常映射为统一失败文案", () => {
  const error = new Error("ocr timeout");
  assert.equal(toSlotUploadErrorMessage(error), OCR_FAIL_MESSAGE);
});
