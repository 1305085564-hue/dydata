import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

// 页面与表单视觉组件：保持本轮职责拆分之前的原语义。
// controller 源码不得并进这个串 —— 并进来会让每条页面断言的命中面变大，
// 页面把实现丢了也能被 controller 里的代码顶替满足（假绿）。
const source = [
  "src/app/(app)/dashboard/video-submit-form-v2.tsx",
  "src/app/(app)/dashboard/form-v2/dialogs.tsx",
  "src/app/(app)/dashboard/form-v2/results-section.tsx",
  "src/app/(app)/dashboard/form-v2/content-section.tsx",
  "src/app/(app)/dashboard/form-v2/more-section.tsx",
  "src/app/(app)/dashboard/form-v2/role-controls.tsx",
  "src/app/(app)/dashboard/form-v2/role-picker.tsx",
  "src/app/(app)/dashboard/form-v2/submit-footer.tsx",
  "src/app/(app)/dashboard/form-v2/submitted-view.tsx",
  "src/app/(app)/dashboard/form-v2/workspace.tsx",
  // 「还差什么」的唯一出口：按钮与页头状态句共用
  "src/lib/video-submit/domain/submit-gaps.ts",
].map(readSource).join("\n");

const pageSource = readSource(
  "src/app/(app)/dashboard/video-submit-form-v2.tsx",
);

// 拆分出的业务 controller：单独成串，只用于校验 controller 自身与其对页面的接线。
const controllerSource = [
  "src/app/(app)/dashboard/video-submit-form-v2/upload-controller.ts",
  "src/app/(app)/dashboard/video-submit-form-v2/submit-controller.ts",
  "src/app/(app)/dashboard/video-submit-form-v2/assignee-controller.ts",
  "src/app/(app)/dashboard/video-submit-form-v2/draft-controller.ts",
  "src/app/(app)/dashboard/video-submit-form-v2/quality-check-controller.ts",
].map(readSource).join("\n");
const panelSource = [
  readFileSync(
    resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-panel-v2.tsx"),
    "utf8",
  ),
  readFileSync(
    resolve(process.cwd(), "src/components/video-submit/video-submit-panel-exemption-dialog.tsx"),
    "utf8",
  ),
  readFileSync(
    resolve(process.cwd(), "src/components/video-submit/video-submit-panel-toolbar.tsx"),
    "utf8",
  ),
].join("\n");
const productionSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/dashboard/production-control-system.tsx"),
  "utf8",
);
const breakdownDrawerSource = readFileSync(
  resolve(process.cwd(), "src/components/topics-v2/breakdown/BreakdownDetailFooter.tsx"),
  "utf8",
);

test("工作台表单单栏自上而下：截图 → 识别结果 → 文案 → 更多 → 提交", () => {
  // 2026-11-15 重排：两栏网格退役，视线顺序 = 做事顺序
  assert.doesNotMatch(source, /lg:grid-cols-\[290px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(source, /lg:contents/);
  const workspace = readSource("src/app/(app)/dashboard/form-v2/workspace.tsx");
  const jsx = workspace.slice(workspace.indexOf("  return ("));
  const order = ["<截图槽位区", "<FormV2ResultsSection", "<FormV2ContentSection", "<FormV2MoreSection"].map((tag) => jsx.indexOf(tag));
  assert.ok(order.every((index) => index > 0), "四段都必须在工作区里");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "四段顺序必须是截图 → 识别结果 → 文案 → 更多");
  assert.ok(pageSource.indexOf("<FormV2Workspace") < pageSource.indexOf("<FormV2SubmitFooter"), "提交区在最后");
  // 步骤条把整条路摊开，且两张截图都没来时只露截图这一步
  assert.match(workspace, /SUBMIT_STEPS\.map/);
  assert.match(workspace, /const showDetails = editing \|\| hasStartedFilling \|\| manualEntry \|\| !screenshotsRequired;/);
  // 「上传时间」系统自己记，人不需要看
  assert.doesNotMatch(source, /上传时间/);
  // 表单内不再重复说状态：今日状态只在页头说一次
  assert.doesNotMatch(pageSource, /创作表达录入|创作纪事补录|确认提交立卷|确认补交立卷/);
});
test("提交区吸底在整行上，按钮自己说还差什么", () => {
  const footer = readSource("src/app/(app)/dashboard/form-v2/submit-footer.tsx");
  assert.match(footer, /<div className="sticky bottom-\[var\(--app-bottom-offset,0px\)\]/);
  assert.doesNotMatch(footer, /md:static/);
  assert.match(footer, /listSubmitGaps\(issueSummary\)/);
  assert.match(footer, /`还差：\$\{gaps\.map\(\(gap\) => gap\.label\)\.join\("、"\)\}`/);
  assert.doesNotMatch(footer, /待补全/);
  assert.match(pageSource, /isBackfillMode\s*\?\s*"补交"[\s\S]*"保存修改"[\s\S]*: "提交"/);
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
  // payload 拼装点已迁入 submit-controller；页面侧只保留 mode 解析入口
  assert.match(pageSource, /const submitMode = resolveVideoSubmitMode\(/);
  assert.match(controllerSource, /mode:\s*resolveVideoSubmitMode\(/);
  assert.match(controllerSource, /videoId:\s*editPayload\?\.video_id/);
  // 编辑时没换图就要把 assets 传空，后端据此复用原截图；断言盯的是这个契约本身，
  // 不盯某个三元写法，避免重构变量名就把守卫打断。
  assert.match(controllerSource, /const shouldReuseExistingScreenshots = mode === "editToday" && buildSubmissionAssets\(slots\)\.length === 0/);
  assert.match(controllerSource, /currentAssets = shouldReuseExistingScreenshots \? \[\] : buildSubmissionAssets\(slots\)/);
  assert.match(controllerSource, /assets:\s*currentAssets/);
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

test("dashboard V2 提交按钮包含快捷键提示并一次展示全部可处理缺项", () => {
  assert.match(source, /title="⌘\/Ctrl\+Enter 提交"/);
  assert.match(source, /summary\.missingRequiredSlots\.length > 0/);
  assert.match(source, /summary\.processingRequiredSlots\.length > 0/);
  assert.match(source, /summary\.failedRequiredSlots\.length > 0/);
  assert.match(source, /summary\.missingRequiredMetrics\.length > 0/);
  assert.match(source, /summary\.missingRequiredMeta\.includes\("videoTitle"\)/);
  assert.match(source, /summary\.missingRequiredMeta\.includes\("content"\)/);
  assert.match(source, /summary\.topicTagMissing/);
  assert.match(source, /summary\.publishedAtUnconfirmed/);
});

test("dashboard V2 指标完成后先到标题，标题回车再到文案", () => {
  assert.match(source, /onCompleteMetrics=\{\(\) => document\.getElementById\("video_title"\)\?\.focus\(\)\}/);
  assert.match(source, /id="video_title"[\s\S]*onKeyDown=\{\(event\) => \{[\s\S]*event\.key === "Enter"[\s\S]*event\.preventDefault\(\);[\s\S]*contentTextareaRef\.current\?\.focus\(\);/);
});

test("dashboard V2 新建草稿 key 跟随账号变化并显示自动保存时间", () => {
  // key 计算已迁入 draft-controller：这里锁 controller 自身，再单独锁页面必须把账号传进去
  assert.match(controllerSource, /const createDraftStorageKey = useMemo\(/);
  assert.match(controllerSource, /\[accountId, userId, today\]/);
  assert.match(
    pageSource,
    /accountId:\s*account\?\.id \?\? null,[\s\S]*today,[\s\S]*mode,[\s\S]*videoId:\s*editDetail\?\.videoId \?\? null/,
  );
  assert.match(source, /`已自动保存 \$\{lastSavedAt\.getHours\(\)\.toString\(\)\.padStart\(2, "0"\)\}:\$\{lastSavedAt\.getMinutes\(\)\.toString\(\)\.padStart\(2, "0"\)\}`/);
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
  assert.match(controllerSource, /topicId:\s*selectedTopicId \|\| initialTopicId \|\| null,/);
  assert.doesNotMatch(source, /data-topic-context=\{initialTopicId\}/);
  assert.doesNotMatch(source, /topic_id: initialTopicId/);
});

test("dashboard V2 四类业务编排由 controller 承担，页面只保留接线且实现不得回潮", () => {
  // 接入点：页面必须真的调用四个 controller
  assert.match(pageSource, /import \{ createUploadHandler \} from "\.\/video-submit-form-v2\/upload-controller"/);
  assert.match(pageSource, /import \{ createSubmitController \} from "\.\/video-submit-form-v2\/submit-controller"/);
  assert.match(pageSource, /import \{ useAssigneeController \} from "\.\/video-submit-form-v2\/assignee-controller"/);
  assert.match(pageSource, /import \{ useVideoSubmitDraftController \} from "\.\/video-submit-form-v2\/draft-controller"/);
  assert.match(pageSource, /createUploadHandler\(\{/);
  assert.match(pageSource, /createSubmitController\(\{/);
  assert.match(pageSource, /useAssigneeController\(\{/);
  assert.match(pageSource, /useVideoSubmitDraftController\(\{/);

  // 四个 controller 各自独立成串，互不顶替
  assert.match(controllerSource, /export function createUploadHandler\(/);
  assert.match(controllerSource, /export function createSubmitController\(/);
  assert.match(controllerSource, /export function useAssigneeController\(/);
  assert.match(controllerSource, /export function useVideoSubmitDraftController\(/);

  // 反向守卫：上传/OCR、提交/补交三类接口调用与 OCR 任务编排不得搬回页面
  assert.doesNotMatch(pageSource, /\/api\/ocr-screenshot/);
  assert.doesNotMatch(pageSource, /\/api\/video-submit/);
  assert.doesNotMatch(pageSource, /\/api\/admin\/fulfillment\/appeals/);
  assert.doesNotMatch(pageSource, /ocrTasksRef\.current!\.begin\(/);
});

test("历史日报参与主工作台日期状态合并，跨月记录不会伪装成漏交", () => {
  assert.match(panelSource, /activityData\?\.history/);
  assert.match(panelSource, /initialReports:\s*\[\.\.\.monthReports, \.\.\.history\]/);
});

test("dashboard V2 的成员加载不再反向依赖历史编辑表单，质量检查由独立 controller 承担", () => {
  assert.match(
    pageSource,
    /import \{ createQualityCheckController \} from "\.\/video-submit-form-v2\/quality-check-controller"/,
  );
  assert.doesNotMatch(pageSource, /from "\.\/history-report-edit-form"/);
  assert.doesNotMatch(pageSource, /\/api\/dashboard\/sample-quality-check/);
  assert.match(
    controllerSource,
    /export function createQualityCheckController\(/,
  );
  assert.match(
    readSource("src/app/(app)/dashboard/history-report-edit-form.tsx"),
    /from "@\/lib\/video-submit-workflow\/operator-members"/,
  );
  assert.doesNotMatch(
    readSource("src/app/(app)/dashboard/history-report-edit-form.tsx"),
    /export async function fetchCachedOperatorMembers/,
  );
});
