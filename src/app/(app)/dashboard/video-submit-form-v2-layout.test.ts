import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-form-v2.tsx"),
  "utf8",
);
const panelSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-panel-v2.tsx"),
  "utf8",
);

test("dashboard V2 的截图栏保持紧凑，团队卡留出呼吸间隔后与文案卡共同向下伸展", () => {
  assert.match(
    source,
    /lg:grid-cols-\[290px_minmax\(0,1fr\)\][^\"]*items-stretch/,
  );
  assert.doesNotMatch(source, /lg:grid-cols-\[320px_1fr\]/);
  assert.match(source, /className="flex min-w-0 flex-col gap-3 lg:h-full lg:gap-6"/);
  assert.match(source, /space-y-2\.5[^\"]*lg:flex-1/);
  assert.match(source, /className="flex min-w-0 flex-col gap-6 lg:h-full"/);
  assert.match(source, /flex flex-1 flex-col min-h-0[^\"]*bg-white/);
  assert.doesNotMatch(source, /lg:justify-between/);
});

test("dashboard V2 的团队分工使用摘要态，题材与形式按需展开", () => {
  assert.match(source, /题材与形式：/);
  assert.match(source, /!isMemoryExpanded/);
  assert.match(source, /onClick=\{\(\) => setIsMemoryExpanded\(true\)\}/);
  assert.match(source, /onClick=\{\(\) => setIsMemoryExpanded\(false\)\}/);
});

test("dashboard V2 表单把新建、异常和完整编辑交给后端 mode 契约", () => {
  assert.match(source, /mode:\s*resolveVideoSubmitMode\(/);
  assert.match(source, /video_id:\s*editPayload\?\.video_id/);
  assert.match(source, /assets:\s*shouldReuseExistingScreenshots/);
});

test("dashboard V2 panel 统一合并首屏、活动、本地报告并接入豁免 Server Action", () => {
  assert.match(panelSource, /mergeDashboardReports\(/);
  assert.match(panelSource, /activityReports:\s*activityData\?\.monthReports/);
  assert.match(panelSource, /monthSubmittedDates/);
  assert.match(panelSource, /onSubmitRequest=/);
  assert.match(panelSource, /submitExemptionRequest\(/);
  assert.doesNotMatch(panelSource, /fetch\(["']\/api\/exemptions\/apply/);
  assert.match(panelSource, /userExemptionReviewNotice/);
  assert.match(panelSource, /disabled=\{isExemptionPending\}/);
});

test("V2 截图错误文案保持 screenshot_1 互动、screenshot_2 完播", () => {
  assert.match(source, /screenshot_1:\s*"互动截图"/);
  assert.match(source, /screenshot_2:\s*"完播截图"/);
});
