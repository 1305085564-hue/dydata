import assert from "node:assert/strict";
import test from "node:test";
import { createSubmitController, type SubmitControllerOptions } from "./submit-controller";

const metricKeys = [
  "play_count",
  "follower_gain",
  "follower_convert",
  "likes",
  "comments",
  "shares",
  "favorites",
  "avg_play_duration",
  "avg_play_ratio",
  "bounce_rate_2s",
  "completion_rate_5s",
  "completion_rate",
] as const;

function createWorkflow() {
  const fields = Object.fromEntries(
    metricKeys.map((key) => [
      key,
      {
        key,
        value: "1",
        source: "manual",
        requiresManualConfirmation: false,
        confirmed: true,
        confidenceScore: null,
        confidenceLevel: null,
        ocrValue: null,
        ocrConfidenceLevel: null,
        manuallyEdited: false,
      },
    ]),
  );

  return {
    meta: {
      videoUrl: "https://example.com/video",
      videoTitle: "超期作品",
      content: "测试文案",
      bizDate: "2026-11-16",
      publishedAt: "2026-11-10T10:00",
      publishedAtText: "2026-11-10 10:00",
      publishedAtSource: "ocr",
      ocrPublishedAt: "2026-11-10T10:00",
      ocrPublishedAtText: "2026-11-10 10:00",
      anomalyStatus: "normal",
      uploadedAt: "",
      topicTag: "复盘",
      videoForm: "出镜",
      contentKeywords: [],
      scriptAuthorUserId: "user-1",
      videoEditorUserId: "user-1",
      operatorUserId: "user-1",
      roleOverrides: [],
    },
    fields,
    slots: {
      screenshot_1: { role: "screenshot_1", assetUrl: null },
      screenshot_2: { role: "screenshot_2", assetUrl: null },
    },
    keywordInput: "",
    hasManualEdit: false,
    hasManualScriptAuthorSelection: false,
    hasManualOperatorSelection: false,
  } as unknown as SubmitControllerOptions["workflow"];
}

test("服务端返回补交门禁时一次提交就打开申请框并停止错误流程", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  let dialogCalls = 0;
  let sent: unknown;
  let pending: unknown;
  const pendingRef = { current: null as Record<string, unknown> | null };

  globalThis.fetch = async (_url, init) => { sent = JSON.parse(String(init?.body)); return new Response(
    JSON.stringify({
      error: "该提交已超过 72 小时，请先申请补交",
      code: "SUBMISSION_APPEAL_REQUIRED",
      reason: "expired",
    }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  ); };
  (globalThis as { window?: unknown }).window = {};

  try {
    const controller = createSubmitController({
      account: { id: "account-1" },
      userId: "user-1",
      mode: "create",
      today: "2026-11-16",
      workflow: createWorkflow(),
      editDetail: null,
      selectedTopicId: null,
      initialTopicId: null,
      supabase: { auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } },
      pendingSubmissionPayloadRef: pendingRef,
      setPendingSubmissionPayload: (value) => { pending = value; },
      setIsSubmitting: () => undefined,
      setAppealRequired: () => undefined,
      setAppealStatus: () => undefined,
      setAppealId: () => undefined,
      setAppealResultReason: () => undefined,
      setAppealReason: () => undefined,
      setIsSubmitted: () => undefined,
      setSubmittedReportId: () => undefined,
      setSubmittedReportDate: () => undefined,
      setSubmittedVideoId: () => undefined,
      setIsAppealDialogOpen: () => {
        dialogCalls += 1;
      },
      setIsAppealSubmitting: () => undefined,
      isAppealSubmitting: false,
      appealReason: "",
      onSubmitted: () => undefined,
      clearDraft: () => undefined,
      pauseDraftSaving: () => undefined,
      scrollToIssueAnchor: () => undefined,
    });

    await controller.executeSubmit();
    assert.equal(dialogCalls, 1);
    assert.deepEqual(pending, sent);
    assert.deepEqual(pendingRef.current, sent);
    assert.equal((pending as { video_title: string }).video_title, "超期作品");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test("补交确认支持显式传入 submissionPayload 实参而不依赖 ref", async () => {
  const originalFetch = globalThis.fetch;
  const capturedBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, init) => {
    capturedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ appeal: { id: "appeal-explicit-1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const controller = createSubmitController({
      account: { id: "account-1" },
      userId: "user-1",
      mode: "create",
      today: "2026-11-16",
      workflow: createWorkflow(),
      editDetail: null,
      selectedTopicId: null,
      initialTopicId: null,
      supabase: { auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } },
      pendingSubmissionPayload: null,
      setPendingSubmissionPayload: () => undefined,
      setIsSubmitting: () => undefined,
      setAppealRequired: () => undefined,
      setAppealStatus: () => undefined,
      setAppealId: () => undefined,
      setAppealResultReason: () => undefined,
      setAppealReason: () => undefined,
      setIsSubmitted: () => undefined,
      setSubmittedReportId: () => undefined,
      setSubmittedReportDate: () => undefined,
      setSubmittedVideoId: () => undefined,
      setIsAppealDialogOpen: () => undefined,
      setIsAppealSubmitting: () => undefined,
      isAppealSubmitting: false,
      appealReason: "手工补交",
      onSubmitted: () => undefined,
      clearDraft: () => undefined,
      pauseDraftSaving: () => undefined,
      scrollToIssueAnchor: () => undefined,
    });

    await controller.handleConfirmAppeal({ mode: "create", video_title: "显式传入标题" });
    assert.deepEqual(capturedBodies[0]?.submissionPayload, { mode: "create", video_title: "显式传入标题" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
