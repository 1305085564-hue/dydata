import test from "node:test";
import assert from "node:assert/strict";

import {
  buildContentExperienceMarkUpsertPayload,
  isContentExperienceType,
  isContentExperienceVisibilityScope,
  normalizeNullableText,
  normalizeOptionalUuid,
  upsertContentExperienceMark,
} from "./content-experience-marks";

test("isContentExperienceType 严格限制经验类型", () => {
  assert.equal(isContentExperienceType("hot_case"), true);
  assert.equal(isContentExperienceType("conversion_issue"), true);
  assert.equal(isContentExperienceType("random_case"), false);
  assert.equal(isContentExperienceType(""), false);
  assert.equal(isContentExperienceType(null), false);
});

test("isContentExperienceVisibilityScope 严格限制可见范围", () => {
  assert.equal(isContentExperienceVisibilityScope("team"), true);
  assert.equal(isContentExperienceVisibilityScope("company"), true);
  assert.equal(isContentExperienceVisibilityScope("private"), false);
  assert.equal(isContentExperienceVisibilityScope(undefined), false);
});

test("normalizeNullableText 和 normalizeOptionalUuid 会清理空白值", () => {
  assert.equal(normalizeNullableText("  值得复用的开头  "), "值得复用的开头");
  assert.equal(normalizeNullableText("   "), null);
  assert.equal(normalizeNullableText(123), null);
  assert.equal(normalizeOptionalUuid("  card-1  "), "card-1");
  assert.equal(normalizeOptionalUuid(""), null);
  assert.equal(normalizeOptionalUuid({}), null);
});

test("buildContentExperienceMarkUpsertPayload 使用服务端 marked_by 并覆盖 upsert 字段", () => {
  const payload = buildContentExperienceMarkUpsertPayload({
    videoId: "video-1",
    markedBy: "manager-1",
    feedbackCardId: "card-1",
    aiInsightResultId: null,
    experienceType: "opening_issue",
    visibilityScope: "team",
    note: "  开头留人差，可作为反例  ",
  });

  assert.equal(payload.video_id, "video-1");
  assert.equal(payload.marked_by, "manager-1");
  assert.equal(payload.feedback_card_id, "card-1");
  assert.equal(payload.ai_insight_result_id, null);
  assert.equal(payload.experience_type, "opening_issue");
  assert.equal(payload.visibility_scope, "team");
  assert.equal(payload.note, "开头留人差，可作为反例");
  assert.match(payload.updated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("upsertContentExperienceMark 按 video_id + marked_by 冲突更新", async () => {
  const upsertedRows: Array<Record<string, unknown>> = [];
  let conflictTarget: string | null = null;

  const supabase = {
    from(table: string) {
      assert.equal(table, "content_experience_marks");
      return {
        upsert(row: Record<string, unknown>, options: { onConflict: string }) {
          upsertedRows.push(row);
          conflictTarget = options.onConflict;
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      id: "mark-1",
                      created_at: "2026-05-28T10:00:00.000Z",
                      ...row,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const saved = await upsertContentExperienceMark(supabase as never, {
    videoId: "video-1",
    markedBy: "server-admin-1",
    experienceType: "fail_case",
    visibilityScope: "company",
    note: "  可复盘的失败案例  ",
  });

  assert.equal(conflictTarget, "video_id,marked_by");
  assert.equal(upsertedRows[0]?.marked_by, "server-admin-1");
  assert.equal(upsertedRows[0]?.experience_type, "fail_case");
  assert.equal(saved.marked_by, "server-admin-1");
  assert.equal(saved.note, "可复盘的失败案例");
});
