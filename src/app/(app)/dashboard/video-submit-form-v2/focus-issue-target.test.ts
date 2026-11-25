import assert from "node:assert/strict";
import test from "node:test";
import type { RefObject } from "react";
import type { MetricGroupHandle } from "@/components/submission/指标分组区";
import { focusSubmissionIssueTarget } from "./focus-issue-target";

function createFakeElement() {
  const calls: string[] = [];
  return {
    calls,
    scrollIntoView: () => {
      calls.push("scrollIntoView");
    },
    focus: (opts?: { preventScroll?: boolean }) => {
      calls.push(opts?.preventScroll ? "focus(preventScroll)" : "focus()");
    },
  } as unknown as HTMLElement & { calls: string[] };
}

function createBaseArgs() {
  const highlighted: Array<HTMLElement | null> = [];
  const focusedMetrics: string[] = [];
  let slotsPulsed = 0;

  return {
    highlighted,
    focusedMetrics,
    getSlotsPulsed: () => slotsPulsed,
    args: {
      anchor: null as "slots" | "metrics" | "topicTag" | "meta" | "publishedAt" | null,
      invalidKey: null as "play_count" | "videoTitle" | "content" | "topicTag" | null,
      missingRequiredSlotsCount: 0,
      focusWithHighlight: (el: HTMLElement | null) => {
        highlighted.push(el);
      },
      triggerSlotsPulse: () => {
        slotsPulsed += 1;
      },
      metricsGroupRef: {
        current: {
          focusMetric: (key) => {
            focusedMetrics.push(key);
          },
        },
      } as RefObject<MetricGroupHandle | null>,
      metaVideoTitleRef: { current: null } as RefObject<HTMLInputElement | null>,
      contentTextareaRef: { current: null } as RefObject<HTMLTextAreaElement | null>,
      topicTagSectionRef: { current: null } as RefObject<HTMLDivElement | null>,
      publishedAtSectionRef: { current: null } as RefObject<HTMLDivElement | null>,
      slotsSectionRef: { current: null } as RefObject<HTMLDivElement | null>,
    },
  };
}

test("漏填必填指标时直接调用 focusMetric 聚焦到第一个出错格", () => {
  const ctx = createBaseArgs();
  focusSubmissionIssueTarget({
    ...ctx.args,
    anchor: "metrics",
    invalidKey: "play_count",
  });
  assert.deepEqual(ctx.focusedMetrics, ["play_count"]);
  assert.equal(ctx.highlighted.length, 0);
});

test("漏填标题或文案时准确把光标送入对应输入框", () => {
  const titleEl = createFakeElement() as unknown as HTMLInputElement;
  const contentEl = createFakeElement() as unknown as HTMLTextAreaElement;

  const ctxTitle = createBaseArgs();
  ctxTitle.args.metaVideoTitleRef.current = titleEl;
  focusSubmissionIssueTarget({ ...ctxTitle.args, anchor: "meta", invalidKey: "videoTitle" });
  assert.equal(ctxTitle.highlighted[0], titleEl);

  const ctxContent = createBaseArgs();
  ctxContent.args.contentTextareaRef.current = contentEl;
  focusSubmissionIssueTarget({ ...ctxContent.args, anchor: "meta", invalidKey: "content" });
  assert.equal(ctxContent.highlighted[0], contentEl);
});

test("题材标签原本折叠时等下一帧渲染完成后优先聚焦到选项按钮，而不是点到展开按钮", () => {
  const chipEl = createFakeElement();
  const toggleBtnEl = createFakeElement();
  let mountedChip = false;
  let queuedFrame: FrameRequestCallback | null = null;

  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window: { requestAnimationFrame: (cb: FrameRequestCallback) => number } }).window = {
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      queuedFrame = cb;
      return 1;
    },
  };

  try {
    const ctx = createBaseArgs();
    ctx.args.topicTagSectionRef.current = {
      querySelector: (selector: string) => {
        if (selector === '[data-topic-tag-chip="true"]') {
          return mountedChip ? chipEl : null;
        }
        return mountedChip ? chipEl : toggleBtnEl;
      },
    } as unknown as HTMLDivElement;

    focusSubmissionIssueTarget({
      ...ctx.args,
      anchor: "topicTag",
      invalidKey: "topicTag",
    });

    // 首帧尚未展开前不应误焦点到「修改」按钮
    assert.equal(ctx.highlighted.length, 0);
    assert.ok(queuedFrame);

    mountedChip = true;
    (queuedFrame as FrameRequestCallback)(0);
    assert.equal(ctx.highlighted[0], chipEl);
  } finally {
    (globalThis as { window?: unknown }).window = prevWindow;
  }
});
