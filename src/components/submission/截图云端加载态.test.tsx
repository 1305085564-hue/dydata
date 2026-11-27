import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { FakeEvent, setupDomTestEnv, type FakeElement } from "@/lib/testing/dom-harness";
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

function findElements(root: FakeElement, predicate: (el: FakeElement) => boolean): FakeElement[] {
  const result: FakeElement[] = [];
  const walk = (node: { childNodes: unknown[] }) => {
    for (const child of node.childNodes) {
      const el = child as FakeElement;
      if (el && el.nodeType === 1) {
        if (predicate(el)) result.push(el);
        walk(el);
      }
    }
  };
  walk(root);
  return result;
}

test("D5：恢复仅含云端 assetUrl 的草稿时展示「来自云端」加载态，加载完成后恢复正常状态", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const harness = setupDomTestEnv();
  const slot1: SlotFixture = {
    ...makeEmptySlot("screenshot_1"),
    status: "confirmed",
    confirmed: true,
    file: null,
    assetUrl: "/api/submission-screenshots/file?path=user-1/account-1/screenshot_1/cloud.png",
    previewUrl: "/api/submission-screenshots/file?path=user-1/account-1/screenshot_1/cloud.png",
  };
  const mounted = await harness.mount(
    <SubmissionSlotsSection
      slots={{ screenshot_1: slot1, screenshot_2: makeEmptySlot("screenshot_2") }}
      onSelectFile={() => undefined}
      onUploadFiles={() => undefined}
      onDelete={() => undefined}
      showCards
    />,
  );
  try {
    assert.match(mounted.container.textContent, /来自云端 · 正在加载截图…/);
    const loadingCards = findElements(mounted.container, (el) => el.getAttribute("data-cloud-image-loading") === "1");
    assert.equal(loadingCards.length, 1);

    const imgs = findElements(mounted.container, (el) => el.tagName === "IMG");
    assert.equal(imgs.length, 1);

    await act(async () => {
      imgs[0].dispatchEvent(new FakeEvent("load"));
    });

    assert.doesNotMatch(mounted.container.textContent, /来自云端 · 正在加载截图…/);
    assert.match(mounted.container.textContent, /已识别/);
    assert.equal(
      findElements(mounted.container, (el) => el.getAttribute("data-cloud-image-loading") === "1").length,
      0,
    );
  } finally {
    await mounted.unmount();
    harness.cleanup();
  }
});

test("D5：云端草稿图加载失败后展示失败兜底态，支持重试加载与触发重传", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const harness = setupDomTestEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 502 })) as typeof fetch;

  const slot1: SlotFixture = {
    ...makeEmptySlot("screenshot_1"),
    status: "confirmed",
    confirmed: true,
    file: null,
    assetUrl: "/api/submission-screenshots/file?path=user-1/account-1/screenshot_1/broken.png",
    previewUrl: "/api/submission-screenshots/file?path=user-1/account-1/screenshot_1/broken.png",
  };

  const mounted = await harness.mount(
    <SubmissionSlotsSection
      slots={{ screenshot_1: slot1, screenshot_2: makeEmptySlot("screenshot_2") }}
      onSelectFile={() => undefined}
      onUploadFiles={() => undefined}
      onDelete={() => undefined}
      showCards
    />,
  );

  try {
    const img = findElements(mounted.container, (el) => el.tagName === "IMG")[0];
    assert.ok(img);

    await act(async () => {
      img.dispatchEvent(new FakeEvent("error"));
    });

    assert.match(mounted.container.textContent, /来自云端 · 加载失败，请重试或重新上传/);
    const retryBtn = findElements(mounted.container, (el) => el.getAttribute("aria-label") === "重试加载互动截图")[0];
    const reuploadBtn = findElements(mounted.container, (el) => el.getAttribute("aria-label") === "重新上传互动截图")[0];
    assert.ok(retryBtn, "失败兜底态必须提供重试加载按钮");
    assert.ok(reuploadBtn, "失败兜底态必须提供重传按钮");

    const fileInputs = findElements(mounted.container, (el) => el.tagName === "INPUT");
    const slot1Input = fileInputs[1];
    assert.ok(slot1Input, "应存在互动截图槽位文件选择器");
    let filePickerClicked = false;
    (slot1Input as unknown as { click: () => void }).click = () => {
      filePickerClicked = true;
    };

    await act(async () => {
      reuploadBtn.dispatchEvent(new FakeEvent("click", { bubbles: true }));
    });
    assert.equal(filePickerClicked, true, "点击重传应打开对应槽位文件选择器");

    await act(async () => {
      retryBtn.dispatchEvent(new FakeEvent("click", { bubbles: true }));
    });
    assert.match(mounted.container.textContent, /来自云端 · 正在加载截图…/);
  } finally {
    await mounted.unmount();
    globalThis.fetch = originalFetch;
    harness.cleanup();
  }
});

test("D5：本地 blob 预览图不误显示来自云端加载态", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const harness = setupDomTestEnv();
  const slot1: SlotFixture = {
    ...makeEmptySlot("screenshot_1"),
    status: "confirmed",
    confirmed: true,
    file: new File(["local"], "local.png", { type: "image/png" }),
    assetUrl: "/api/submission-screenshots/file?path=user-1/account-1/screenshot_1/local.png",
    previewUrl: "blob:local-preview-1",
  };

  const mounted = await harness.mount(
    <SubmissionSlotsSection
      slots={{ screenshot_1: slot1, screenshot_2: makeEmptySlot("screenshot_2") }}
      onSelectFile={() => undefined}
      onUploadFiles={() => undefined}
      onDelete={() => undefined}
      showCards
    />,
  );

  try {
    assert.doesNotMatch(mounted.container.textContent, /来自云端/);
    assert.match(mounted.container.textContent, /已识别/);
  } finally {
    await mounted.unmount();
    harness.cleanup();
  }
});
