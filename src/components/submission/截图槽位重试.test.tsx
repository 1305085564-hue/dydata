import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SubmissionSlotsSection } from "./截图槽位区";
import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";

type SlotFixture = SubmissionSlotState & {
  file?: File | null;
  fileName?: string;
  error?: string | null;
  assetUrl?: string | null;
  previewUrl?: string | null;
  ocrFallback?: boolean;
};

function makeEmptySlot(role: SubmissionSlotRole): SlotFixture {
  return {
    role,
    required: true,
    status: "empty",
    confirmed: false,
    requiresManualConfirmation: false,
    confidenceScore: null,
    file: null,
    assetUrl: null,
    previewUrl: null,
    error: null,
    ocrFallback: false,
  };
}

function renderSlots(slot1: SlotFixture, options: { withOnRetry?: boolean } = {}): string {
  const noop = () => {};
  return renderToStaticMarkup(
    <SubmissionSlotsSection
      slots={{
        screenshot_1: slot1,
        screenshot_2: makeEmptySlot("screenshot_2"),
      }}
      onSelectFile={noop}
      onUploadFiles={noop}
      onDelete={noop}
      onRetry={options.withOnRetry === false ? undefined : noop}
      showCards
    />,
  );
}

test("场景 1：上传失败仅保留本地 file（无 assetUrl）时，展示「重新识别」按钮", () => {
  const localFile = new File(["mock-image"], "data.png", { type: "image/png" });
  const markup = renderSlots({
    ...makeEmptySlot("screenshot_1"),
    status: "failed",
    file: localFile,
    assetUrl: null,
    previewUrl: "blob:local-preview",
    error: "上传超时，请重试",
  });

  assert.match(markup, /aria-label="重新识别互动截图"/);
});

test("场景 2：刷新草稿恢复仅保留云端 assetUrl（无本地 file）时，失败或待确认均展示「重新识别」按钮", () => {
  const failedDraftMarkup = renderSlots({
    ...makeEmptySlot("screenshot_1"),
    status: "failed",
    file: null,
    assetUrl: "/api/submission-screenshots/file?path=draft-1.png",
    error: "识别通道繁忙",
    ocrFallback: true,
  });
  assert.match(failedDraftMarkup, /aria-label="重新识别互动截图"/);

  const pendingConfirmDraftMarkup = renderSlots({
    ...makeEmptySlot("screenshot_1"),
    status: "pending_confirm",
    file: null,
    assetUrl: "/api/submission-screenshots/file?path=draft-2.png",
    error: "部分字段缺失",
  });
  assert.match(pendingConfirmDraftMarkup, /aria-label="重新识别互动截图"/);
});

test("边界保护：无图、处理中、已确认或未提供 onRetry 时不展示「重新识别」按钮", () => {
  // 既无 assetUrl 也无 file
  const noSourceMarkup = renderSlots({
    ...makeEmptySlot("screenshot_1"),
    status: "failed",
    file: null,
    assetUrl: null,
  });
  assert.doesNotMatch(noSourceMarkup, /aria-label="重新识别互动截图"/);

  // 处理中（uploading / recognizing）
  const localFile = new File(["mock-image"], "data.png", { type: "image/png" });
  const recognizingMarkup = renderSlots({
    ...makeEmptySlot("screenshot_1"),
    status: "recognizing",
    file: localFile,
    assetUrl: "/api/submission-screenshots/file?path=draft-3.png",
  });
  assert.doesNotMatch(recognizingMarkup, /aria-label="重新识别互动截图"/);

  // 已确认且无 ocrFallback
  const confirmedMarkup = renderSlots({
    ...makeEmptySlot("screenshot_1"),
    status: "confirmed",
    confirmed: true,
    file: localFile,
    assetUrl: "/api/submission-screenshots/file?path=draft-4.png",
    ocrFallback: false,
  });
  assert.doesNotMatch(confirmedMarkup, /aria-label="重新识别互动截图"/);

  // 未传 onRetry
  const noCallbackMarkup = renderSlots(
    {
      ...makeEmptySlot("screenshot_1"),
      status: "failed",
      file: localFile,
      assetUrl: null,
    },
    { withOnRetry: false },
  );
  assert.doesNotMatch(noCallbackMarkup, /aria-label="重新识别互动截图"/);
});
