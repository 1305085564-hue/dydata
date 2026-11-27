import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEditableFields,
  createEditableFieldsFromEditDetail,
  createEditableSlots,
  createEditableSlotsFromEditDetail,
  createInitialMeta,
  createMetaFromEditDetail,
  createScreenshotItemsFromEditDetail,
  deriveSlotsFromItems,
  type ScreenshotItem,
} from "@/lib/video-submit/domain/video-submit-form-model";
import type { VideoSubmissionEditDetail } from "@/lib/video-submit/domain/video-submit-form-state";
import { createWorkflowState, workflowReducer } from "@/lib/video-submit-workflow/reducer";
import { buildSubmissionState, serializeVideoSubmitDraft } from "@/lib/video-submit-workflow/selectors";
import { createOcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import type { WorkflowAction } from "@/lib/video-submit-workflow/types";
import { summarizeSubmissionIssues } from "@/components/submission/填报表单状态";
import { areSubmissionScreenshotsRequired } from "@/components/submission/提交状态机";
import { isPublishedAtConfirmed } from "@/lib/video-submit-deadline";
import { createSubmitController } from "./submit-controller";
import { createUploadHandler } from "./upload-controller";
import { applyRestoredVideoSubmitDraft } from "./draft-controller";

const TODAY = "2026-11-27";
const USER_ID = "user-1";
const ACCOUNT = { id: "account-1" };
const SCREENSHOT_1_URL = "/api/submission-screenshots/file?path=user-1/account-1/screenshot_1/s1.png";
const SCREENSHOT_2_URL = "/api/submission-screenshots/file?path=user-1/account-1/screenshot_2/s2.png";

function createFlowHarness(options: {
  mode?: "create" | "editToday" | "backfill";
  editDetail?: VideoSubmissionEditDetail | null;
} = {}) {
  const mode = options.mode ?? "create";
  const editDetail = options.editDetail ?? null;
  const initialItems = editDetail ? createScreenshotItemsFromEditDetail(editDetail) : [];
  let workflow = createWorkflowState({
    meta: editDetail ? createMetaFromEditDetail(editDetail, TODAY, USER_ID) : createInitialMeta(TODAY, USER_ID),
    fields: editDetail ? createEditableFieldsFromEditDetail(editDetail) : createEditableFields(),
    slots: initialItems.length > 0
      ? deriveSlotsFromItems(initialItems)
      : editDetail ? createEditableSlotsFromEditDetail(editDetail) : createEditableSlots(),
    draft: { hasManualEdit: editDetail?.dataSource === "manual" },
  });
  const screenshotItemsRef = { current: initialItems as ScreenshotItem[] };
  const slotsRef = { current: workflow.slots };
  const ocrTasksRef = { current: createOcrTaskRegistry() };
  const blobUrlsRef = { current: new Set<string>() };
  const pendingSubmissionPayloadRef = { current: null as Record<string, unknown> | null };
  let submittedCount = 0;
  let clearedDraftCount = 0;
  let pausedDraftCount = 0;
  let isSubmitted = false;
  let submittedVideoId: string | null = null;
  let submittedReportId: string | null = null;

  const dispatchWorkflow = (action: WorkflowAction) => {
    workflow = workflowReducer(workflow, action);
  };
  const updateItemsState = (updater: (current: ScreenshotItem[]) => ScreenshotItem[]) => {
    screenshotItemsRef.current = updater(screenshotItemsRef.current);
    slotsRef.current = deriveSlotsFromItems(screenshotItemsRef.current);
    dispatchWorkflow({ type: "slots/update", updater: () => slotsRef.current });
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
  } as unknown as SupabaseClient;

  const upload = createUploadHandler({
    account: ACCOUNT,
    userId: USER_ID,
    initialSummary: null,
    supabase,
    ocrTasksRef,
    slotsRef,
    itemsRef: screenshotItemsRef,
    blobUrlsRef,
    updateItemsState,
    dispatchWorkflow,
  });

  const runSubmit = () => {
    const controller = createSubmitController({
      account: ACCOUNT,
      userId: USER_ID,
      mode,
      today: TODAY,
      workflow,
      editDetail,
      selectedTopicId: null,
      initialTopicId: null,
      supabase,
      pendingSubmissionPayloadRef,
      setIsSubmitting: () => undefined,
      setAppealRequired: () => undefined,
      setAppealStatus: () => undefined,
      setAppealId: () => undefined,
      setAppealResultReason: () => undefined,
      setAppealReason: () => undefined,
      setIsSubmitted: (next) => { isSubmitted = typeof next === "function" ? next(isSubmitted) : next; },
      setSubmittedReportId: (next) => { submittedReportId = typeof next === "function" ? next(submittedReportId) : next; },
      setSubmittedReportDate: () => undefined,
      setSubmittedVideoId: (next) => { submittedVideoId = typeof next === "function" ? next(submittedVideoId) : next; },
      setIsAppealDialogOpen: () => undefined,
      setIsAppealSubmitting: () => undefined,
      isAppealSubmitting: false,
      appealReason: "",
      onSubmitted: () => { submittedCount += 1; },
      clearDraft: () => { clearedDraftCount += 1; },
      pauseDraftSaving: () => { pausedDraftCount += 1; },
      scrollToIssueAnchor: () => undefined,
    });
    return controller.executeSubmit();
  };

  return {
    upload,
    runSubmit,
    dispatchWorkflow,
    screenshotItemsRef,
    slotsRef,
    get workflow() { return workflow; },
    get isSubmitted() { return isSubmitted; },
    get submittedCount() { return submittedCount; },
    get clearedDraftCount() { return clearedDraftCount; },
    get pausedDraftCount() { return pausedDraftCount; },
    get submittedVideoId() { return submittedVideoId; },
    get submittedReportId() { return submittedReportId; },
  };
}

test("完整主流程护栏：OCR 填充两张截图并新建提交成功", async () => {
  const harness = createFlowHarness();
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const submittedBodies: Array<Record<string, unknown>> = [];
  let blobIdx = 0;

  URL.createObjectURL = (() => `blob:flow-${++blobIdx}`) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === "/api/submission-screenshots") {
      const form = init?.body as FormData;
      const role = String(form.get("asset_role"));
      const path = `user-1/account-1/${role}/f.png`;
      return Response.json({ data: { bucket: "submission-screenshots", path, url: `/api/submission-screenshots/file?path=${encodeURIComponent(path)}` } });
    }
    if (url === "/api/ocr-screenshot") {
      const form = init?.body as FormData;
      const role = String(form.get("asset_role"));
      if (role === "screenshot_1") {
        return Response.json({
          data: {
            slot_status: "confirmed",
            screenshot_type: "data",
            confidence_score: 0.98,
            requires_manual_confirmation: false,
            recognized_fields: {
              video_title: "测试新作品",
              play_count: 5000,
              likes: 200,
              comments: 30,
              shares: 15,
              favorites: 40,
              follower_gain: 25,
            },
          },
        });
      }
      return Response.json({
        data: {
          slot_status: "confirmed",
          screenshot_type: "retention",
          confidence_score: 0.96,
          requires_manual_confirmation: false,
          recognized_fields: {
            published_at: "2026-11-26T10:00",
            published_at_text: "2026-11-26 10:00",
            retention_metrics: {
              avg_play_duration: 18.5,
              avg_play_ratio: 62.3,
              bounce_rate_2s: 21.4,
              completion_rate_5s: 48.2,
              completion_rate: 16.8,
            },
          },
        },
      });
    }
    if (url === "/api/video-submit") {
      submittedBodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        ok: true,
        daily_report_id: "report-new-1",
        daily_report_date: "2026-11-26",
        video: { id: "video-new-1", account_id: ACCOUNT.id, user_id: USER_ID, video_title: "测试新作品" },
      });
    }
    if (url === "/api/usage-events") return Response.json({ ok: true });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    await harness.upload("screenshot_1", new File(["1"], "s1.png", { type: "image/png" }));
    await harness.upload("screenshot_2", new File(["2"], "s2.png", { type: "image/png" }));
    harness.dispatchWorkflow({
      type: "meta/update",
      updater: (current) => ({ ...current, content: "这是一段完整的测试文案", topicTag: "干货" }),
    });

    const summary = summarizeSubmissionIssues(
      buildSubmissionState(harness.workflow.slots, harness.workflow.fields, false),
      {
        topicTag: harness.workflow.meta.topicTag,
        anomalyStatus: harness.workflow.meta.anomalyStatus,
        videoTitle: harness.workflow.meta.videoTitle,
        content: harness.workflow.meta.content,
        submissionMode: "create",
        publishedAtConfirmed: isPublishedAtConfirmed(harness.workflow.meta.publishedAtText),
        screenshotsRequired: true,
      },
    );
    assert.equal(summary.canSubmit, true);

    await harness.runSubmit();
    assert.equal(harness.isSubmitted, true);
    assert.equal(harness.submittedCount, 1);
    assert.equal(harness.clearedDraftCount, 1);
    assert.equal(harness.pausedDraftCount, 1);
    assert.equal(harness.submittedVideoId, "video-new-1");
    assert.equal(harness.submittedReportId, "report-new-1");
    assert.equal(submittedBodies.length, 1);
    assert.equal(submittedBodies[0]?.mode, "create");
    assert.equal(submittedBodies[0]?.video_title, "测试新作品");
    assert.equal(submittedBodies[0]?.published_at_source, "ocr");
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test("本地草稿恢复护栏：恢复仅含云端 assetUrl 的草稿保留标题文案与截图槽位", () => {
  const sourceHarness = createFlowHarness();
  sourceHarness.dispatchWorkflow({
    type: "meta/update",
    updater: (current) => ({
      ...current,
      videoTitle: "草稿标题",
      content: "草稿文案内容",
      topicTag: "复盘",
      publishedAt: "2026-11-26T12:00",
      publishedAtText: "2026-11-26 12:00",
    }),
  });
  sourceHarness.dispatchWorkflow({
    type: "slots/update",
    updater: (current) => ({
      ...current,
      screenshot_1: {
        ...current.screenshot_1,
        status: "confirmed",
        confirmed: true,
        assetUrl: SCREENSHOT_1_URL,
        previewUrl: "blob:expired-before-refresh",
        file: new File(["a"], "a.png", { type: "image/png" }),
      },
    }),
  });

  const persistedDraft = serializeVideoSubmitDraft(sourceHarness.workflow);
  const restoredHarness = createFlowHarness();
  applyRestoredVideoSubmitDraft(persistedDraft, {
    userId: USER_ID,
    dispatchWorkflow: restoredHarness.dispatchWorkflow,
    screenshotItemsRef: restoredHarness.screenshotItemsRef,
    slotsRef: restoredHarness.slotsRef,
    setScreenshotItems: () => undefined,
  });

  assert.equal(restoredHarness.workflow.meta.videoTitle, "草稿标题");
  assert.equal(restoredHarness.workflow.meta.content, "草稿文案内容");
  assert.equal(restoredHarness.workflow.slots.screenshot_1.assetUrl, SCREENSHOT_1_URL);
  assert.equal(restoredHarness.workflow.slots.screenshot_1.file, null);
  assert.equal(restoredHarness.workflow.slots.screenshot_1.previewUrl, SCREENSHOT_1_URL);
});

test("编辑历史模式护栏：不更换截图时提交 mode=edit 且带回原 video_id", async () => {
  const editDetail: VideoSubmissionEditDetail = {
    videoId: "video-existing-1",
    accountId: ACCOUNT.id,
    bizDate: "2026-11-25",
    uploadedAt: "2026-11-25T10:00:00.000Z",
    dataSource: "ai",
    meta: {
      videoUrl: null,
      videoTitle: "历史作品标题",
      content: "历史文案",
      publishedAt: "2026-11-25T09:00:00+08:00",
      publishedAtText: "2026-11-25 09:00",
      anomalyStatus: "normal",
      topicTag: "干货",
      videoForm: "出镜",
      contentKeywords: [],
      punishType: null,
      platformNotice: null,
      appeal: null,
      scriptAuthorUserId: USER_ID,
      videoEditorUserId: USER_ID,
      operatorUserId: USER_ID,
    },
    metrics: {
      playCount: 1200,
      likes: 60,
      comments: 8,
      shares: 4,
      favorites: 10,
      followerGain: 5,
      followerLoss: 0,
      followerConvert: null,
      avgPlayDuration: 14,
      avgPlayRatio: 0.42,
      bounceRate2s: 0.25,
      completionRate5s: 0.45,
      completionRate: 0.18,
    },
    assets: [
      { role: "screenshot_1", url: SCREENSHOT_1_URL, confirmed: true, confidenceScore: 0.95, screenshotType: "data", recognizedFields: null },
      { role: "screenshot_2", url: SCREENSHOT_2_URL, confirmed: true, confidenceScore: 0.95, screenshotType: "retention", recognizedFields: null },
    ],
    assigneeProfiles: [],
  };

  const harness = createFlowHarness({ mode: "editToday", editDetail });
  const originalFetch = globalThis.fetch;
  const submittedBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === "/api/video-submit") {
      submittedBodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        ok: true,
        daily_report_id: "report-existing-1",
        daily_report_date: "2026-11-25",
        video: { id: "video-existing-1", account_id: ACCOUNT.id, user_id: USER_ID, video_title: "修改后的历史标题" },
      });
    }
    if (url === "/api/usage-events") return Response.json({ ok: true });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    harness.dispatchWorkflow({
      type: "meta/update",
      updater: (current) => ({ ...current, videoTitle: "修改后的历史标题" }),
    });
    await harness.runSubmit();
    assert.equal(harness.isSubmitted, true);
    assert.equal(submittedBodies[0]?.mode, "edit");
    assert.equal(submittedBodies[0]?.video_id, "video-existing-1");
    assert.equal(submittedBodies[0]?.video_title, "修改后的历史标题");
    assert.equal(submittedBodies[0]?.screenshots_refreshed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("异常上报护栏：无截图且无需发布时间确认即可以 mode=abnormal 提交", async () => {
  const harness = createFlowHarness({ mode: "create" });
  harness.dispatchWorkflow({
    type: "meta/update",
    updater: (current) => ({
      ...current,
      anomalyStatus: "abnormal",
      punishType: "限流",
      platformNotice: "系统提示限流",
      content: "异常作品文案",
      topicTag: "复盘",
    }),
  });
  harness.dispatchWorkflow({
    type: "fields/update",
    updater: (current) => ({
      ...current,
      play_count: { ...current.play_count, value: "800" },
      likes: { ...current.likes, value: "20" },
      comments: { ...current.comments, value: "3" },
      shares: { ...current.shares, value: "2" },
      favorites: { ...current.favorites, value: "5" },
      follower_gain: { ...current.follower_gain, value: "1" },
      avg_play_duration: { ...current.avg_play_duration, value: "12" },
      bounce_rate_2s: { ...current.bounce_rate_2s, value: "30" },
      completion_rate_5s: { ...current.completion_rate_5s, value: "40" },
      completion_rate: { ...current.completion_rate, value: "10" },
    }),
  });
  const screenshotsRequired = areSubmissionScreenshotsRequired(harness.workflow.meta.anomalyStatus);
  assert.equal(screenshotsRequired, false);

  const summary = summarizeSubmissionIssues(
    buildSubmissionState(harness.workflow.slots, harness.workflow.fields, false),
    {
      topicTag: harness.workflow.meta.topicTag,
      anomalyStatus: harness.workflow.meta.anomalyStatus,
      videoTitle: harness.workflow.meta.videoTitle,
      content: harness.workflow.meta.content,
      submissionMode: "abnormal",
      publishedAtConfirmed: false,
      screenshotsRequired,
    },
  );
  assert.equal(summary.canSubmit, true);

  const originalFetch = globalThis.fetch;
  const submittedBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === "/api/video-submit") {
      submittedBodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        ok: true,
        daily_report_id: "report-abn-1",
        daily_report_date: TODAY,
        video: { id: "video-abn-1", account_id: ACCOUNT.id, user_id: USER_ID, anomaly_status: "abnormal" },
      });
    }
    if (url === "/api/usage-events") return Response.json({ ok: true });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    await harness.runSubmit();
    assert.equal(harness.isSubmitted, true);
    assert.equal(submittedBodies[0]?.mode, "abnormal");
    assert.equal(submittedBodies[0]?.anomaly_status, "abnormal");
    assert.equal(submittedBodies[0]?.punish_type, "限流");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
