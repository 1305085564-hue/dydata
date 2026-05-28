import test from "node:test";
import assert from "node:assert/strict";

import {
  buildContentObservationUpsertRow,
  loadContentObservation,
  saveContentObservation,
} from "./content-observations";

test("content-observations 把 unset 和空字符串保存为 null", () => {
  const row = buildContentObservationUpsertRow({
    videoId: "video-1",
    observerId: "admin-1",
    now: "2026-05-28T12:00:00.000Z",
    input: {
      traffic_peak_level: "unset",
      post_peak_trend: "",
      traffic_retention_quality: null,
      drop_off_stage: undefined,
      suspected_problem_stage: "weak_conversion",
      note: "  结尾导流弱  ",
    },
  });

  assert.deepEqual(row, {
    video_id: "video-1",
    observer_id: "admin-1",
    traffic_peak_level: null,
    post_peak_trend: null,
    traffic_retention_quality: null,
    drop_off_stage: null,
    suspected_problem_stage: "weak_conversion",
    note: "结尾导流弱",
    updated_at: "2026-05-28T12:00:00.000Z",
  });
});

test("content-observations 严格拒绝非法枚举", () => {
  assert.throws(
    () =>
      buildContentObservationUpsertRow({
        videoId: "video-1",
        observerId: "admin-1",
        input: {
          traffic_peak_level: "very_high",
        },
      }),
    /traffic_peak_level 枚举值不正确/,
  );
});

test("content-observations 保存时 observer_id 来自服务端参数", async () => {
  const upsertedRows: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      assert.equal(table, "content_observations");
      return {
        upsert(row: Record<string, unknown>, options: Record<string, unknown>) {
          upsertedRows.push(row);
          assert.deepEqual(options, { onConflict: "video_id,observer_id" });
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      id: "observation-1",
                      created_at: "2026-05-28T11:00:00.000Z",
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

  const saved = await saveContentObservation({
    supabase: supabase as never,
    videoId: "video-1",
    observerId: "server-admin-1",
    input: {
      observer_id: "client-forged-admin",
      traffic_peak_level: "high",
      note: "  高开低走  ",
    } as Record<string, unknown>,
  });

  assert.equal(upsertedRows[0]?.observer_id, "server-admin-1");
  assert.equal(saved.observer_id, "server-admin-1");
  assert.equal(saved.traffic_peak_level, "high");
  assert.equal(saved.note, "高开低走");
});

test("content-observations 读取只查当前视频和当前管理者", async () => {
  const clauses: Array<[string, string]> = [];
  const supabase = {
    from(table: string) {
      assert.equal(table, "content_observations");
      return {
        select() {
          return this;
        },
        eq(field: string, value: string) {
          clauses.push([field, value]);
          return this;
        },
        async maybeSingle() {
          return {
            data: {
              id: "observation-1",
              video_id: "video-1",
              observer_id: "admin-1",
              traffic_peak_level: null,
              post_peak_trend: null,
              traffic_retention_quality: null,
              drop_off_stage: null,
              suspected_problem_stage: null,
              note: null,
              created_at: "2026-05-28T11:00:00.000Z",
              updated_at: "2026-05-28T12:00:00.000Z",
            },
            error: null,
          };
        },
      };
    },
  };

  const observation = await loadContentObservation({
    supabase: supabase as never,
    videoId: "video-1",
    observerId: "admin-1",
  });

  assert.deepEqual(clauses, [
    ["video_id", "video-1"],
    ["observer_id", "admin-1"],
  ]);
  assert.equal(observation?.id, "observation-1");
});
