import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { resolveMetricToCheckCount } from "@/components/submission/指标分组区";
import { resolveDraftPromptState } from "@/app/(app)/dashboard/video-submit-form-v2/draft-controller";
import { cleanMetricInputValue } from "@/lib/dashboard-logic/metric-input-cleaner";

test("#13 必填空格即使输入框未展开也计入待核对", () => {
  const count = resolveMetricToCheckCount([
    { key: "play_count", mode: "blank", value: "" },
    { key: "likes", mode: "doubt", value: "12" },
    { key: "follower_convert", mode: "blank", value: "" },
  ]);

  assert.equal(count, 2);
});

test("#13 没有 OCR 结果时不生成‘请核对’计数提示", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/submission/指标分组区.tsx"),
    "utf8",
  );
  assert.match(source, /recognizedCount > 0/);
});

test("#12 数字清洗拒绝字母、科学计数法和负数", () => {
  assert.equal(cleanMetricInputValue("abc"), "");
  assert.equal(cleanMetricInputValue("1e9"), "");
  assert.equal(cleanMetricInputValue("-5"), "");
});

test("#4 刷新发现草稿时只显示恢复提示，点击恢复后提示关闭", () => {
  const savedAt = new Date("2026-11-16T10:00:00+08:00");
  const initial = resolveDraftPromptState({
    hasDraft: true,
    isSubmitted: false,
    submittedViewActive: false,
    hasInitialSummary: false,
    promptDismissed: false,
    lastSavedAt: savedAt,
  });
  assert.equal(initial.showDraftBanner, true);
  assert.equal(initial.displayLastSavedAt, null);

  const activeSession = resolveDraftPromptState({
    hasDraft: false,
    isSubmitted: false,
    submittedViewActive: false,
    hasInitialSummary: false,
    promptDismissed: false,
    lastSavedAt: savedAt,
  });
  assert.equal(activeSession.showDraftBanner, false);
  assert.equal(activeSession.displayLastSavedAt?.toISOString(), savedAt.toISOString());

  const restored = resolveDraftPromptState({
    hasDraft: true,
    isSubmitted: false,
    submittedViewActive: false,
    hasInitialSummary: false,
    promptDismissed: true,
    lastSavedAt: savedAt,
  });
  assert.equal(restored.showDraftBanner, false);
  assert.equal(restored.displayLastSavedAt?.toISOString(), savedAt.toISOString());
});

test("#15 手填态保留返回上传与切换异常入口", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/dashboard/form-v2/workspace.tsx"),
    "utf8",
  );
  assert.match(source, /返回上传截图/);
  assert.match(source, /作品被限流或删了/);
});
