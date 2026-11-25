import assert from "node:assert/strict";
import { act } from "react";
import test from "node:test";
import { toast } from "sonner";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { FakeMouseEvent, setupDomTestEnv } from "@/lib/testing/dom-harness";
import { COPY_FEEDBACK_MS, CopyButton } from "./copy-button";

test("CopyButton 点击后原地切换为「已复制」、不弹 toast，约 2 秒后复原", async (t) => {
  const copiedTexts: string[] = [];
  const env = setupDomTestEnv({
    clipboardWriteText: async (value) => {
      copiedTexts.push(value);
    },
  });

  const toastSuccessMock = t.mock.method(toast, "success");
  const toastErrorMock = t.mock.method(toast, "error");
  const feedbackSuccessMock = t.mock.method(feedbackToast, "success");
  const feedbackErrorMock = t.mock.method(feedbackToast, "error");
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const { container, unmount } = await env.mount(
    <CopyButton text="https://example.com/u/1" label="复制链接" copiedLabel="已复制" />,
  );

  try {
    const button = container.querySelector("button");
    assert.ok(button, "应渲染复制按钮");
    assert.equal(button.textContent, "复制链接");
    assert.equal(button.getAttribute("data-copied"), null);

    await act(async () => {
      button.dispatchEvent(new FakeMouseEvent("click"));
      await Promise.resolve();
    });

    assert.deepEqual(copiedTexts, ["https://example.com/u/1"]);
    assert.equal(button.getAttribute("data-copied"), "true");
    assert.equal(button.textContent, "已复制");
    assert.equal(toastSuccessMock.mock.callCount(), 0, "复制成功不应弹 sonner toast.success");
    assert.equal(feedbackSuccessMock.mock.callCount(), 0, "复制成功不应弹 feedbackToast.success");
    assert.equal(toastErrorMock.mock.callCount(), 0);
    assert.equal(feedbackErrorMock.mock.callCount(), 0);

    await act(async () => {
      t.mock.timers.tick(COPY_FEEDBACK_MS - 1);
    });
    assert.equal(button.getAttribute("data-copied"), "true", "未满 2 秒时应保持已复制态");
    assert.equal(button.textContent, "已复制");

    await act(async () => {
      t.mock.timers.tick(1);
    });
    assert.equal(button.getAttribute("data-copied"), null, "满 2 秒后应复原未复制态");
    assert.equal(button.textContent, "复制链接");
    assert.equal(toastSuccessMock.mock.callCount(), 0);
    assert.equal(feedbackSuccessMock.mock.callCount(), 0);
  } finally {
    await unmount();
    env.cleanup();
  }
});

test("CopyButton 写入剪贴板失败时提示错误且不切换为已复制", async (t) => {
  const env = setupDomTestEnv({
    clipboardWriteText: async () => {
      throw new Error("clipboard denied");
    },
  });
  const feedbackErrorMock = t.mock.method(feedbackToast, "error", () => "err-id");

  const { container, unmount } = await env.mount(
    <CopyButton text="secret-text" label="复制链接" errorMessage="复制失败，请重试" />,
  );

  try {
    const button = container.querySelector("button");
    assert.ok(button);

    await act(async () => {
      button.dispatchEvent(new FakeMouseEvent("click"));
      await Promise.resolve();
    });

    assert.equal(button.getAttribute("data-copied"), null);
    assert.equal(button.textContent, "复制链接");
    assert.equal(feedbackErrorMock.mock.callCount(), 1);
    assert.equal(feedbackErrorMock.mock.calls[0]?.arguments[0], "复制失败，请重试");
  } finally {
    await unmount();
    env.cleanup();
  }
});
