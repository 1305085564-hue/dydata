import test from "node:test";
import assert from "node:assert/strict";

import { syncAbnormalVideoCase } from "./abnormal-case";

type Insert = { table: string; payload: Record<string, unknown> };

function createSupabase(options: { existingCaseId?: string; conflictOnInsert?: boolean } = {}) {
  const inserts: Insert[] = [];

  return {
    inserts,
    from(table: string) {
      assert.equal(table, "violation_cases");
      return {
        select(query: string) {
          assert.equal(query, "id");
          return {
            eq(column: string, value: unknown) {
              assert.equal(column, "source_video_id");
              assert.equal(value, "video-1");
              return this;
            },
            async maybeSingle() {
              return {
                data: options.existingCaseId ? { id: options.existingCaseId } : null,
                error: null,
              };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return {
            select(query: string) {
              assert.equal(query, "id");
              return {
                async single() {
                  if (options.conflictOnInsert) {
                    return { data: null, error: { code: "23505", message: "duplicate" } };
                  }
                  return { data: { id: "case-1" }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const abnormalInput = {
  videoId: "video-1",
  submitterId: "user-1",
  accountId: "account-1",
  accountName: "账号 A",
  teamId: "team-1",
  anomalyStatus: "abnormal",
  punishType: "limited" as const,
  platformNotice: "系统提示账号限流",
  appeal: "已申诉",
  scriptText: "异常视频文案",
  screenshotPaths: ["https://example.com/screenshot.png"],
  videoUrl: "https://www.douyin.com/video/1",
  videoTitle: "异常视频",
};

test("正常视频不创建避坑案例", async () => {
  const supabase = createSupabase();

  const result = await syncAbnormalVideoCase({
    supabase,
    input: { ...abnormalInput, anomalyStatus: "normal" },
  });

  assert.deepEqual(result, { status: "skipped_normal" });
  assert.equal(supabase.inserts.length, 0);
});

test("异常视频创建 submitted 避坑案例并保留来源上下文", async () => {
  const supabase = createSupabase();

  const result = await syncAbnormalVideoCase({ supabase, input: abnormalInput });

  assert.deepEqual(result, { status: "created", caseId: "case-1" });
  assert.deepEqual(supabase.inserts, [{
    table: "violation_cases",
    payload: {
      source_video_id: "video-1",
      submitted_by: "user-1",
      script_text: "异常视频文案",
      is_violation: true,
      category: "短视频",
      account_id: "account-1",
      account_name_snapshot: "账号 A",
      team_id: "team-1",
      screenshot_paths: ["https://example.com/screenshot.png"],
      status: "submitted",
      is_deleted: false,
      risk_level: "medium",
      purpose: "violation",
      platforms: ["抖音"],
      source_metadata: {
        source: "dashboard_video_submit",
        punish_type: "limited",
        platform_notice: "系统提示账号限流",
        appeal: "已申诉",
        video_url: "https://www.douyin.com/video/1",
        video_title: "异常视频",
      },
    },
  }]);
});

test("同一视频重复提交不会生成第二条案例", async () => {
  const supabase = createSupabase({ existingCaseId: "case-existing" });

  const result = await syncAbnormalVideoCase({ supabase, input: abnormalInput });

  assert.deepEqual(result, { status: "already_exists", caseId: "case-existing" });
  assert.equal(supabase.inserts.length, 0);
});

test("并发重复写入命中唯一约束时按已存在处理", async () => {
  const supabase = createSupabase({ conflictOnInsert: true });

  const result = await syncAbnormalVideoCase({ supabase, input: abnormalInput });

  assert.deepEqual(result, { status: "already_exists", caseId: null });
  assert.equal(supabase.inserts.length, 1);
});
