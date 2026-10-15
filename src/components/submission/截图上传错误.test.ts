import test from "node:test";
import assert from "node:assert/strict";

import {
  LOGIN_EXPIRED_MESSAGE,
  NETWORK_RETRY_MESSAGE,
  OCR_ERROR_MESSAGES,
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

test("登录失效错误统一映射为登录过期提示", () => {
  // 输入沿用旧文案，验证服务端历史文案仍被识别为登录失效
  const error = new Error("登录状态已失效，请刷新页面后重试");
  assert.equal(toScreenshotUploadErrorMessage(error), LOGIN_EXPIRED_MESSAGE);
  assert.equal(toOcrErrorMessage(error), LOGIN_EXPIRED_MESSAGE);
});

test("未知 OCR 提供商和超时细节映射为统一失败文案", () => {
  const error = new Error("ocr timeout");
  assert.equal(toOcrErrorMessage(error), OCR_FAIL_MESSAGE);
});

test("OCR 结构化错误码映射为明确文案", () => {
  assert.equal(toOcrErrorMessage("RATE_LIMITED"), OCR_ERROR_MESSAGES.RATE_LIMITED);
  assert.equal(toOcrErrorMessage("AI_TIMEOUT"), OCR_ERROR_MESSAGES.AI_TIMEOUT);
  assert.equal(toOcrErrorMessage("AI_EMPTY_RESPONSE"), OCR_ERROR_MESSAGES.AI_EMPTY_RESPONSE);
  assert.equal(toOcrErrorMessage("STORAGE_READ_FAILED"), OCR_ERROR_MESSAGES.STORAGE_READ_FAILED);
});

test("低置信度识别会提示截图必须包含完整页面信息", () => {
  assert.match(toOcrErrorMessage("LOW_CONFIDENCE"), /标题/);
  assert.match(toOcrErrorMessage("LOW_CONFIDENCE"), /发布时间/);
  assert.match(toOcrErrorMessage("LOW_CONFIDENCE"), /数据指标/);
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
  assert.equal(toOcrErrorMessage(new Error(OCR_ERROR_MESSAGES.BLURRY)), OCR_ERROR_MESSAGES.BLURRY);
  assert.equal(toOcrErrorMessage(new Error("provider quota exceeded")), OCR_FAIL_MESSAGE);
});
