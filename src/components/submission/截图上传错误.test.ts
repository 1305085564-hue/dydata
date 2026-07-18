import test from "node:test";
import assert from "node:assert/strict";

import {
  NETWORK_RETRY_MESSAGE,
  OCR_FAIL_MESSAGE,
  SCREENSHOT_UPLOAD_FAIL_MESSAGE,
  toOcrErrorMessage,
  toScreenshotUploadErrorMessage,
} from "./截图上传错误";

test("网络异常映射为可重试文案", () => {
  const error = new TypeError("Failed to fetch");
  assert.equal(toScreenshotUploadErrorMessage(error), NETWORK_RETRY_MESSAGE);
  assert.equal(toOcrErrorMessage(error), NETWORK_RETRY_MESSAGE);
});

test("登录失效错误保持原文案", () => {
  const error = new Error("登录状态已失效，请刷新页面后重试");
  assert.equal(toScreenshotUploadErrorMessage(error), "登录状态已失效，请刷新页面后重试");
  assert.equal(toOcrErrorMessage(error), "登录状态已失效，请刷新页面后重试");
});

test("未知 OCR 提供商和超时细节映射为统一失败文案", () => {
  const error = new Error("ocr timeout");
  assert.equal(toOcrErrorMessage(error), OCR_FAIL_MESSAGE);
});

test("上传阶段只放行固定白名单错误", () => {
  assert.equal(
    toScreenshotUploadErrorMessage(new Error("仅支持 jpg、png、webp 图片")),
    "仅支持 jpg、png、webp 图片",
  );
  assert.equal(
    toScreenshotUploadErrorMessage(new Error("图片内容与文件类型不一致或文件已损坏")),
    "图片内容与文件类型不一致或文件已损坏",
  );
  assert.equal(
    toScreenshotUploadErrorMessage(new Error("storage secret details")),
    SCREENSHOT_UPLOAD_FAIL_MESSAGE,
  );
});

test("OCR 阶段只放行结构化识别文案", () => {
  assert.equal(toOcrErrorMessage(new Error("图片模糊，请重新截图确保文字清晰")), "图片模糊，请重新截图确保文字清晰");
  assert.equal(toOcrErrorMessage(new Error("provider quota exceeded")), OCR_FAIL_MESSAGE);
});
