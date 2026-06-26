import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConfirmedFeedbackPayload,
  buildContentFeedbackCardView,
  buildFeedbackSaveDraftMutation,
  isFeedbackCardDelivered,
} from "./content-feedback-cards";
import type { NextDayReviewResult } from "@/types";

function createDraftResult(): NextDayReviewResult {
  return {
    ok: true,
    video_id: "video-1",
    sample_level: "full",
    sample_status: "可正式复盘",
    sample_message: "样本充足，可做段落级诊断",
    review_status: "success",
    summary: {
      grade: "B",
      one_line: "开头承接偏慢，中段观点有效。",
      problem_tags: ["开头拖沓", "CTA靠后"],
    },
    metrics: {
      play_count: 42000,
      bounce_rate_2s: 0.41,
      completion_rate_5s: 0.52,
      completion_rate: 0.28,
      avg_play_duration: 18.5,
    },
    comparison: {
      account_baseline: {
        sample_count: 8,
        play_count: 35000,
        bounce_rate_2s: 0.38,
        completion_rate_5s: 0.49,
        completion_rate: 0.24,
        avg_play_duration: 16.2,
      },
      peer_baseline: {
        available: false,
        sample_count: 0,
        summary: "第一版暂未启用同类比较",
      },
    },
    anomaly_notice: null,
    segments: [
      {
        segment_order: 1,
        segment_type: "开头钩子",
        segment_text: "半导体今天还能不能追？",
        time_range: "0:00-0:05",
        health: "warning",
        judgement: "开头问题抛出后承接偏慢",
        reason: "前5秒留人不够集中",
        suggestion: "结论前置，先给立场",
        priority: "primary",
      },
    ],
    actions: {
      diagnosis: "主要问题在开头承接和 CTA 时机。",
      instructions: ["前3秒先给结论", "中段压缩背景", "CTA 提前到 20 秒前"],
      message_for_member: "这条先改开头和 CTA，再重发一版。",
    },
    cached: false,
  };
}

test("buildContentFeedbackCardView 在无卡片时返回未开始", () => {
  const view = buildContentFeedbackCardView("video-1", null);

  assert.equal(view.workflow_status, "not_started");
  assert.equal(view.workflow_label, "未生成");
  assert.equal(view.has_ai_draft, false);
});

test("buildContentFeedbackCardView 在 AI 初稿阶段返回待确认", () => {
  const view = buildContentFeedbackCardView("video-1", {
    id: "card-1",
    video_id: "video-1",
    card_status: "draft",
    manager_note: null,
    draft_payload: createDraftResult(),
    confirmed_payload: null,
    draft_generated_at: "2026-05-22T10:00:00.000Z",
    confirmed_at: null,
    sent_at: null,
    viewed_at: null,
  });

  assert.equal(view.workflow_status, "draft");
  assert.equal(view.workflow_label, "AI初稿待确认");
  assert.equal(view.has_ai_draft, true);
  assert.equal(isFeedbackCardDelivered(view.workflow_status), false);
});

test("buildConfirmedFeedbackPayload 支持人工覆盖文案后确认", () => {
  const confirmed = buildConfirmedFeedbackPayload(createDraftResult(), {
    summary: {
      one_line: "先改开头承接，再把 CTA 提前。",
      problem_tags: ["开头承接", "CTA时机"],
    },
    actions: {
      diagnosis: "核心矛盾是留人和转化口径没有衔接。",
      instructions: ["开头一句话先报答案", "删掉第二段铺垫", "CTA 放到倒数第二句"],
      message_for_member: "按这三条先改，今晚前补一版。",
    },
  });

  assert.equal(confirmed.summary.one_line, "先改开头承接，再把 CTA 提前。");
  assert.equal(confirmed.actions.diagnosis, "核心矛盾是留人和转化口径没有衔接。");
  assert.deepEqual(confirmed.actions.instructions, ["开头一句话先报答案", "删掉第二段铺垫", "CTA 放到倒数第二句"]);
  assert.equal(confirmed.actions.message_for_member, "按这三条先改，今晚前补一版。");
});

test("buildConfirmedFeedbackPayload 在明确传入空 instructions 时保留空数组", () => {
  const confirmed = buildConfirmedFeedbackPayload(createDraftResult(), {
    actions: {
      instructions: [],
    },
  });

  assert.deepEqual(confirmed.actions.instructions, []);
});

test("buildFeedbackSaveDraftMutation 保存已确认卡片时不退回草稿或清空确认状态", () => {
  const payload = createDraftResult();
  const mutation = buildFeedbackSaveDraftMutation({
    currentStatus: "confirmed",
    payload,
    managerNote: "更新后的反馈",
    hasManagerNote: true,
    currentManagerNote: "旧反馈",
    now: "2026-06-04T06:00:00.000Z",
  });

  assert.equal(mutation.card_status, "confirmed");
  assert.equal(mutation.manager_note, "更新后的反馈");
  assert.equal(mutation.confirmed_payload, payload);
  assert.equal(Object.hasOwn(mutation, "confirmed_by"), false);
  assert.equal(Object.hasOwn(mutation, "confirmed_at"), false);
  assert.equal(Object.hasOwn(mutation, "sent_by"), false);
  assert.equal(Object.hasOwn(mutation, "sent_at"), false);
});

test("buildFeedbackSaveDraftMutation 保存草稿卡片时仍会清理未下发状态", () => {
  const payload = createDraftResult();
  const mutation = buildFeedbackSaveDraftMutation({
    currentStatus: "draft",
    payload,
    managerNote: null,
    hasManagerNote: false,
    currentManagerNote: "保留原备注",
    now: "2026-06-04T06:00:00.000Z",
  });

  assert.equal(mutation.card_status, "draft");
  assert.equal(mutation.manager_note, "保留原备注");
  assert.equal(mutation.draft_payload, payload);
  assert.equal(mutation.confirmed_payload, null);
  assert.equal(mutation.sent_at, null);
});
