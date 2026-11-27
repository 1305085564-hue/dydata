import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHandleFulfillmentAppealResponse,
  type HandleFulfillmentAppealDeps,
} from "./route";
import { deriveResumePending } from "@/app/api/exemptions/_fulfillment-appeals";

const APPEAL_ID = "123e4567-e89b-42d3-a456-426614174010";
const ACTOR_ID = "123e4567-e89b-42d3-a456-426614174011";
const OWNER_ID = "123e4567-e89b-42d3-a456-426614174012";
const VIDEO_ID = "123e4567-e89b-42d3-a456-426614174013";
const REPORT_ID = "123e4567-e89b-42d3-a456-426614174014";

type TestAuth = Parameters<HandleFulfillmentAppealDeps["requireOwnerOrAdminRole"]>[0];

function makePostSubmitDeps(overrides: Partial<HandleFulfillmentAppealDeps> = {}): HandleFulfillmentAppealDeps {
  const auth = {
    supabase: {},
    actor: { userId: ACTOR_ID },
    permissionInfo: {},
    scope: { kind: "team", visibleUserIds: [OWNER_ID], activeVisibleUserIds: [OWNER_ID] },
  } as unknown as TestAuth;
  return {
    requireAdminServiceClient: async () => auth,
    requireOwnerOrAdminRole: () => null,
    requireActiveVisibleUsers: () => null,
    loadAppealOwner: async () => ({
      data: {
        user_id: OWNER_ID,
        account_id: "account-1",
        record_date: "2026-11-20",
        review_mode: "post_submit",
        video_id: VIDEO_ID,
        daily_report_id: REPORT_ID,
      },
      error: null,
    }),
    handleAppealRpc: async (_auth, input) => ({
      data: {
        status: input.decision === "approve" ? "approved" : "rejected",
        review_mode: "post_submit",
        settlement_excluded: input.decision === "reject",
      },
      error: null,
    }),
    emit: async () => ({ ok: true, inserted: 1 }),
    markDone: async () => true,
    markAppealTodosDone: async () => ({ count: 1 }),
    withRetry: async <T>(task: (attempt: number) => Promise<T>) => task(1),
    withTimeout: async <T>(task: (signal: AbortSignal) => Promise<T>) => task(new AbortController().signal),
    resumeSubmission: async () => {
      throw new Error("post_submit 事后核查不能重复触发自动续交");
    },
    ...overrides,
  };
}

test("事后核查「确认正常」不触发自动续交，发送确认正常通知并关闭待办", async () => {
  let emitted: Record<string, unknown> | undefined;
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "approve" },
    makePostSubmitDeps({
      emit: async (payload) => {
        emitted = payload as unknown as Record<string, unknown>;
        return { ok: true, inserted: 1 };
      },
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.status, "approved");
  assert.equal(body.autoResumeStatus, "skipped");
  assert.equal(body.todoStatus, "succeeded");
  assert.equal(emitted?.title, "提交核查已确认正常");
  assert.match(String(emitted?.body), /保留文案优条数结算资格/);
  assert.equal(emitted?.actionLabel, null);
});

test("事后核查「标为无效（不计优结算）」原因必填，传入 RPC 并通知成员不计优结算", async () => {
  const missingReason = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "reject" },
    makePostSubmitDeps(),
  );
  assert.equal(missingReason.status, 400);

  let emitted: Record<string, unknown> | undefined;
  let capturedReason: string | undefined;
  const response = await buildHandleFulfillmentAppealResponse(
    { appealId: APPEAL_ID, decision: "reject", reason: "手填发布时间与平台记录不符" },
    makePostSubmitDeps({
      handleAppealRpc: async (_auth, input) => {
        capturedReason = input.reason;
        return {
          data: { status: "rejected", review_mode: "post_submit", settlement_excluded: true },
          error: null,
        };
      },
      emit: async (payload) => {
        emitted = payload as unknown as Record<string, unknown>;
        return { ok: true, inserted: 1 };
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(capturedReason, "手填发布时间与平台记录不符");
  assert.equal(emitted?.title, "提交已标为无效（不计优结算）");
  assert.match(String(emitted?.body), /不计入文案优条数结算/);
  assert.match(String(emitted?.body), /手填发布时间与平台记录不符/);
});

test("deriveResumePending 对 post_submit 始终返回 null，对旧 pre_submit 保持原逻辑", () => {
  assert.equal(deriveResumePending("approved", { mode: "create" }, "post_submit"), null);
  assert.equal(deriveResumePending("approved", { mode: "create" }, "pre_submit"), true);
  assert.equal(deriveResumePending("approved", null, "pre_submit"), false);
});
