import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { SubmissionSlotCard } from "./截图槽位卡";

test("槽位失败态默认显示统一识别失败文案", () => {
  const html = renderToStaticMarkup(
    <SubmissionSlotCard
      role="overview"
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
      role="overview"
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
