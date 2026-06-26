import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveNextDayReviewDraftSyncMode,
  syncDraftFeedbackCard,
} from "./next-day-review-service";
import type { ContentFeedbackCard, NextDayReviewResult } from "@/types";

function createReviewResult(): NextDayReviewResult {
  return {
    ok: true,
    video_id: "video-1",
    sample_level: "full",
    sample_status: "可正式复盘",
    sample_message: "样本充足",
    review_status: "success",
    summary: {
      grade: "B",
      one_line: "开头承接偏慢",
      problem_tags: ["开头"],
    },
    metrics: {
      play_count: 10000,
      bounce_rate_2s: 40,
      completion_rate_5s: 45,
      completion_rate: 25,
      avg_play_duration: 18,
    },
    comparison: {
      account_baseline: {
        sample_count: 3,
        play_count: 9000,
        bounce_rate_2s: 42,
        completion_rate_5s: 43,
        completion_rate: 22,
        avg_play_duration: 16,
      },
      peer_baseline: {
        available: false,
        sample_count: 0,
        summary: "",
      },
    },
    segments: [],
    actions: {
      diagnosis: "开头弱",
      instructions: [],
      message_for_member: "先改开头",
    },
    anomaly_notice: null,
    cached: false,
  };
}

function createConfirmedCard(): ContentFeedbackCard {
  const confirmedPayload = createReviewResult();
  return {
    id: "card-1",
    video_id: "video-1",
    target_user_id: "user-1",
    target_account_id: "account-1",
    source_result_id: "result-old",
    card_status: "confirmed",
    manager_note: "已确认",
    draft_payload: null,
    confirmed_payload: confirmedPayload,
    draft_generated_at: null,
    confirmed_by: "admin-1",
    confirmed_at: "2026-06-04T05:00:00.000Z",
    sent_by: null,
    sent_at: null,
    viewed_at: null,
    created_at: "2026-06-04T05:00:00.000Z",
    updated_at: "2026-06-04T05:00:00.000Z",
  };
}

function createSupabase(existing: ContentFeedbackCard | null) {
  let updatePayload: Record<string, unknown> | null = null;
  return {
    get updatePayload() {
      return updatePayload;
    },
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: existing });
        },
        insert() {
          return this;
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          return this;
        },
        single() {
          return Promise.resolve({
            data: existing && updatePayload ? { ...existing, ...updatePayload } : existing,
          });
        },
      };
    },
  };
}

test("resolveNextDayReviewDraftSyncMode 默认使用 ensure，只有强制刷新才 refresh", () => {
  assert.equal(resolveNextDayReviewDraftSyncMode(false), "ensure");
  assert.equal(resolveNextDayReviewDraftSyncMode(true), "refresh");
});

test("syncDraftFeedbackCard ensure 模式不覆盖已确认反馈卡", async () => {
  const existing = createConfirmedCard();
  const supabase = createSupabase(existing);

  const result = await syncDraftFeedbackCard({
    supabase: supabase as never,
    videoId: "video-1",
    targetUserId: "user-1",
    targetAccountId: "account-1",
    sourceResultId: "result-new",
    draftPayload: createReviewResult(),
    mode: "ensure",
  });

  assert.equal(result?.card_status, "confirmed");
  assert.equal(result?.confirmed_by, "admin-1");
  assert.equal(result?.source_result_id, "result-old");
  assert.equal(supabase.updatePayload, null);
});
