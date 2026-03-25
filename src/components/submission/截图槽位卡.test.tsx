import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { SubmissionSlotCard } from "./截图槽位卡";

test("槽位失败态默认显示统一识别失败文案", () => {
  const html = renderToStaticMarkup(
    <SubmissionSlotCard
      role="screenshot_1"
      title="槽1 overview"
      description="数据总览截图"
      required
      status="failed"
      onSelectFile={() => {}}
      onDelete={() => {}}
    />,
  );

  assert.match(html, /识别失败，请手动填写或重新上传/);
});

test("网络异常时显示重试按钮", () => {
  const html = renderToStaticMarkup(
    <SubmissionSlotCard
      role="screenshot_1"
      title="槽1 overview"
      description="数据总览截图"
      required
      status="failed"
      error="网络异常，请重试"
      onSelectFile={() => {}}
      onDelete={() => {}}
      onRetry={() => {}}
    />,
  );

  assert.match(html, /网络异常，请重试/);
  assert.match(html, /<button[^>]*>\s*重试\s*<\/button>/);
});

test("识别成功后展示 OCR 文字摘要", () => {
  const html = renderToStaticMarkup(
    <SubmissionSlotCard
      role="screenshot_2"
      title="槽2 曲线图"
      description="推流曲线截图"
      required={false}
      status="confirmed"
      onSelectFile={() => {}}
      onDelete={() => {}}
      {...({
        ocrSummary: ["曲线类型：二次起量", "长尾强弱：高"],
      } as Record<string, unknown>)}
    />,
  );

  assert.match(html, /曲线类型：二次起量/);
  assert.match(html, /长尾强弱：高/);
});
