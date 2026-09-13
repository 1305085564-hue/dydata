import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-form-v2.tsx"),
  "utf8",
);
const panelSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-panel-v2.tsx"),
  "utf8",
);
const productionSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/production-control-system.tsx"),
  "utf8",
);
const breakdownDrawerSource = readFileSync(
  resolve(process.cwd(), "src/components/topics-v2/TopicWorkBreakdownDrawer.tsx"),
  "utf8",
);

test("dashboard V2 的截图栏保持紧凑，团队卡留出呼吸间隔后与文案卡共同向下伸展", () => {
  assert.match(
    source,
    /lg:grid-cols-\[290px_minmax\(0,1fr\)\][^\"]*items-start/,
  );
  assert.doesNotMatch(source, /lg:grid-cols-\[320px_1fr\]/);
  assert.match(source, /className="flex min-w-0 flex-col gap-3 lg:gap-6"/);
  assert.match(source, /space-y-2\.5[^\"]*lg:flex-1/);
  assert.match(source, /className="flex min-w-0 flex-col gap-6"/);
  assert.match(source, /flex flex-col min-h-0[^\"]*bg-white/);
  assert.doesNotMatch(source, /lg:justify-between/);
});

test("dashboard V2 的团队分工使用内联分段器常态呈现题材与形式", () => {
  assert.match(source, /题材标签/);
  assert.match(source, /视频形式/);
  assert.match(source, /updateMeta\("topicTag"/);
  assert.match(source, /updateMeta\("videoForm"/);
});

test("dashboard V2 隐藏部分共创岗位后仍保留恢复入口", () => {
  assert.match(source, /getHiddenRoleRestoreLabel\(hiddenRoles\)/);
  assert.match(source, /hiddenRoleRestoreLabel &&/);
  assert.match(source, /\{hiddenRoleRestoreLabel\}/);
});

test("dashboard V2 表单把新建、异常和完整编辑交给后端 mode 契约", () => {
  assert.match(source, /mode:\s*resolveVideoSubmitMode\(/);
  assert.match(source, /video_id:\s*editPayload\?\.video_id/);
  assert.match(source, /assets:\s*shouldReuseExistingScreenshots/);
});

test("dashboard V2 panel 统一合并首屏、活动、本地报告并接入豁免 Server Action", () => {
  assert.match(panelSource, /mergeDashboardReports\(/);
  // 活动接口只回历史增量：当月事实以首屏 props 为单一来源（2026-08-30 提速批次）
  assert.match(panelSource, /activityReports:\s*\[\.\.\.\(activityData\?\.history \?\? \[\]\)\]/);
  assert.match(panelSource, /monthSubmittedDates/);
  assert.match(panelSource, /onSubmitRequest=/);
  assert.match(panelSource, /submitExemptionRequest\(/);
  assert.doesNotMatch(panelSource, /fetch\(["']\/api\/exemptions\/apply/);
  assert.match(panelSource, /title="可申请停笔调养；已在审批中的日期会被锁定"/);
  assert.doesNotMatch(panelSource, /disabled=\{isExemptionPending\}/);
});

test("dashboard V2 首次渲染不读取浏览器缓存，避免豁免提示 hydration 不一致", () => {
  assert.match(
    panelSource,
    /const \[dismissedPendingExemption, setDismissedPendingExemption\] = useState\(false\);/,
  );
  assert.match(panelSource, /useEffect\(\(\) => \{[\s\S]*dydata:dismissed-pending-exemption/);
});

test("dashboard V2 灰态提交按钮仍走 triggerSubmit 给出问题反馈", () => {
  assert.match(source, /const issueSummaryRef = useRef\(issueSummary\);/);
  assert.match(source, /if \(!canActuallySubmit\) \{[\s\S]*setHasAttemptedSubmit\(true\);[\s\S]*triggerFormShake\(\);[\s\S]*scrollToIssueAnchor\(issueSummaryRef\.current\.firstIssueAnchor\);[\s\S]*return;[\s\S]*\}/);
  assert.match(source, /disabled=\{isSubmitting\}/);
  assert.match(source, /aria-disabled=\{!canActuallySubmit \|\| undefined\}/);
  assert.doesNotMatch(source, /disabled=\{isSubmitting \|\| !canActuallySubmit\}/);
  assert.match(source, /: "bg-\[#F1F1F0\] text-\[#78716C\]\/60 shadow-none/);
  assert.match(source, /: "bg-\[#F1F1F0\][^"]*hover:bg-\[#F1F1F0\]/);
  assert.doesNotMatch(source, /: "disabled:bg-\[#F1F1F0\]/);
  const mergedGreyButtonClasses = cn(buttonVariants({
    variant: "default",
    size: "l",
    className: "bg-[#F1F1F0] text-[#78716C]/60 shadow-none hover:bg-[#F1F1F0]",
  }));
  assert.match(mergedGreyButtonClasses, /hover:bg-\[#F1F1F0\]/);
  assert.doesNotMatch(mergedGreyButtonClasses, /hover:bg-\[#C46A4D\]/);
  assert.match(source, /if \(cmdEnter\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*triggerSubmit\(\);/);
});

test("dashboard V2 指标完成后先到标题，标题回车再到文案", () => {
  assert.match(source, /onCompleteMetrics=\{\(\) => document\.getElementById\("video_title"\)\?\.focus\(\)\}/);
  assert.match(source, /id="video_title"[\s\S]*onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*event\.preventDefault\(\);[\s\S]*contentTextareaRef\.current\?\.focus\(\);/);
});

test("dashboard V2 新建草稿 key 跟随账号变化并显示自动保存时间", () => {
  assert.match(source, /const createDraftStorageKey = useMemo\(/);
  assert.match(source, /\[account\?\.id, userId, today\]/);
  assert.match(source, /已自动保存 \{lastSavedAt\.getHours\(\)\.toString\(\)\.padStart\(2, "0"\)\}:\{lastSavedAt\.getMinutes\(\)\.toString\(\)\.padStart\(2, "0"\)\}/);
});

test("V2 截图错误文案保持 screenshot_1 互动、screenshot_2 完播", () => {
  assert.match(source, /screenshot_1:\s*"互动截图"/);
  assert.match(source, /screenshot_2:\s*"完播截图"/);
});

test("选题脚本入口把子题上下文带入工作台并交给提交接口", () => {
  assert.match(breakdownDrawerSource, /buildDashboardTopicHref\(subTopicId, subTopicInfo\?\.title\)/);
  assert.match(productionSource, /useSearchParams\(\)/);
  assert.match(productionSource, /normalizeDashboardTopicId\(searchParams\.get\("topic_id"\)\)/);
  assert.match(source, /const activeTopicId = selectedTopicId \|\| initialTopicId;/);
  assert.match(source, /topicId:\s*activeTopicId,/);
  assert.match(source, /topic_id:\s*selectedTopicId \|\| initialTopicId \|\| null,/);
  assert.doesNotMatch(source, /data-topic-context=\{initialTopicId\}/);
  assert.doesNotMatch(source, /topic_id: initialTopicId/);
});

test("历史日报参与主工作台日期状态合并，跨月记录不会伪装成漏交", () => {
  assert.match(panelSource, /activityData\?\.history/);
  assert.match(panelSource, /initialReports:\s*\[\.\.\.monthReports, \.\.\.history\]/);
});
