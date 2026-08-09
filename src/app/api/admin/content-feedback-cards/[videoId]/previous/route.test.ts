import test from "node:test";
import assert from "node:assert/strict";

import { selectPreviousFeedbackCard } from "./route";

test("previous feedback picks the latest prior video draft and marks its source", () => {
  const result = selectPreviousFeedbackCard(
    [
      { id: "video-draft", published_at: "2026-08-08T10:00:00.000Z" },
      { id: "video-sent", published_at: "2026-08-07T10:00:00.000Z" },
    ],
    [
      {
        id: "card-sent",
        video_id: "video-sent",
        card_status: "sent",
        draft_generated_at: null,
        confirmed_at: "2026-08-07T10:55:00.000Z",
        sent_at: "2026-08-07T11:00:00.000Z",
        draft_payload: null,
        confirmed_payload: { summary: { one_line: "旧下发建议" } },
      },
      {
        id: "card-draft",
        video_id: "video-draft",
        card_status: "draft",
        draft_generated_at: "2026-08-08T11:00:00.000Z",
        confirmed_at: null,
        sent_at: null,
        draft_payload: { summary: { one_line: "最新草稿建议" } },
        confirmed_payload: null,
      },
    ],
  );

  assert.equal(result?.card.id, "card-draft");
  assert.equal(result?.source, "draft");
  assert.equal(result?.recorded_at, "2026-08-08T11:00:00.000Z");
});

test("previous feedback keeps historical sent cards readable", () => {
  const result = selectPreviousFeedbackCard(
    [{ id: "video-sent", published_at: "2026-08-07T10:00:00.000Z" }],
    [{
      id: "card-sent",
      video_id: "video-sent",
      card_status: "viewed",
      draft_generated_at: "2026-08-07T10:30:00.000Z",
      confirmed_at: "2026-08-07T10:55:00.000Z",
      sent_at: "2026-08-07T11:00:00.000Z",
      draft_payload: null,
      confirmed_payload: { summary: { one_line: "历史下发建议" } },
    }],
  );

  assert.equal(result?.source, "sent");
  assert.equal(result?.recorded_at, "2026-08-07T11:00:00.000Z");
  assert.equal((result?.payload?.summary as { one_line?: string }).one_line, "历史下发建议");
});

test("没有更早视频时不返回 previous", () => {
  assert.equal(selectPreviousFeedbackCard([], []), null);
});

test("confirmed 卡仍标记草稿，但优先读取人工确认的 payload", () => {
  const result = selectPreviousFeedbackCard(
    [{ id: "video-confirmed", published_at: "2026-08-07T10:00:00.000Z" }],
    [{
      id: "card-confirmed",
      video_id: "video-confirmed",
      card_status: "confirmed",
      draft_generated_at: "2026-08-07T10:30:00.000Z",
      confirmed_at: "2026-08-07T10:55:00.000Z",
      sent_at: null,
      draft_payload: { summary: { one_line: "未经确认的旧草稿" } },
      confirmed_payload: { summary: { one_line: "人工确认后的结论" } },
    }],
  );

  assert.equal(result?.source, "draft");
  assert.equal((result?.payload?.summary as { one_line?: string }).one_line, "人工确认后的结论");
});

test("confirmed 卡没有 draft_payload 时回退读取 confirmed_payload", () => {
  const result = selectPreviousFeedbackCard(
    [{ id: "video-confirmed", published_at: "2026-08-07T10:00:00.000Z" }],
    [{
      id: "card-confirmed",
      video_id: "video-confirmed",
      card_status: "confirmed",
      draft_generated_at: null,
      confirmed_at: "2026-08-07T10:55:00.000Z",
      sent_at: null,
      draft_payload: null,
      confirmed_payload: { summary: { one_line: "人工确认后的结论" } },
    }],
  );

  assert.equal((result?.payload?.summary as { one_line?: string }).one_line, "人工确认后的结论");
});

test("历史卡两个 payload 都为空时安全返回 null payload", () => {
  const result = selectPreviousFeedbackCard(
    [{ id: "video-draft", published_at: "2026-08-07T10:00:00.000Z" }],
    [{
      id: "card-draft",
      video_id: "video-draft",
      card_status: "draft",
      draft_generated_at: "2026-08-07T10:30:00.000Z",
      confirmed_at: null,
      sent_at: null,
      draft_payload: null,
      confirmed_payload: null,
    }],
  );

  assert.equal(result?.payload, null);
});
