import test from "node:test";
import assert from "node:assert/strict";

import {
  loadViolationsList,
  loadViolationCaseDetail,
  loadViolationCaseTestRecords,
  type DetailClientLike,
} from "./read-model";

type DetailRow = {
  id: string;
  script_text: string;
  purpose: "violation" | "conversion";
  is_deleted: boolean;
};

function createDetailClient(rows: DetailRow[]): DetailClientLike {
  return {
    from(table: string) {
      assert.equal(table, "violation_cases");

      let pendingId: string | null = null;
      let pendingDeleted: boolean | null = null;
      let pendingPurpose: string | null = null;

      const execute = async () => {
        const row = rows.find((item) =>
          item.id === pendingId
          && item.is_deleted === pendingDeleted
          && (pendingPurpose ? item.purpose === pendingPurpose : true),
        );
        return { data: row ?? null, error: row ? null : { message: "not found" } };
      };

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          if (column === "id") pendingId = String(value);
          if (column === "is_deleted") pendingDeleted = Boolean(value);
          if (column === "purpose") pendingPurpose = String(value);
          return builder;
        },
        async single() {
          return execute();
        },
        async maybeSingle() {
          return execute();
        },
      };

      return builder;
    },
  };
}

test("detail service 在主查询 miss 时会回退读取 conversion 案例", async () => {
  const primary = createDetailClient([]);
  const fallback = createDetailClient([
    {
      id: "conv-1",
      script_text: "转化脚本",
      purpose: "conversion",
      is_deleted: false,
    },
  ]);

  const result = await loadViolationCaseDetail({
    supabase: primary,
    fallbackDetailClient: fallback,
    id: "conv-1",
  });

  assert.equal(result.errorMessage, null);
  assert.equal(result.data?.id, "conv-1");
  assert.equal(result.data?.purpose, "conversion");
});

test("违规列表默认读取 videos 异常记录，不再读取 violation_cases", async () => {
  const requestedTables: string[] = [];
  const client = {
    from(table: string) {
      requestedTables.push(table);
      assert.equal(table, "videos");

      const rows = [
        {
          id: "video-1",
          content: "违规文案",
          anomaly_status: "abnormal",
          punish_type: "limited",
          uploaded_at: "2026-07-15T08:00:00.000Z",
          created_at: "2026-07-15T08:00:00.000Z",
        },
      ];

      const builder = {
        select() {
          return builder;
        },
        in() {
          return builder;
        },
        eq() {
          return builder;
        },
        ilike() {
          return builder;
        },
        order() {
          return builder;
        },
        async range() {
          return { data: rows, error: null, count: rows.length };
        },
      };

      return builder;
    },
  };

  const { payload, errorMessage } = await loadViolationsList({
    supabase: client,
    view: "admin",
    page: 1,
    pageSize: 20,
    from: 0,
    to: 19,
    sort: null,
    order: "desc",
  });

  assert.equal(errorMessage, null);
  assert.deepEqual(requestedTables, ["videos"]);
  assert.equal(payload?.data[0]?.id, "video-1");
  assert.equal(payload?.data[0]?.script_text, "违规文案");
  assert.equal(payload?.data[0]?.category, "limited");
});

test("高转化列表仍读取 violation_cases，避免破坏转化库", async () => {
  const requestedTables: string[] = [];
  const client = {
    from(table: string) {
      requestedTables.push(table);
      assert.equal(table, "violation_cases");

      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        ilike() {
          return builder;
        },
        order() {
          return builder;
        },
        async range() {
          return { data: [], error: null, count: 0 };
        },
      };

      return builder;
    },
  };

  const { payload, errorMessage } = await loadViolationsList({
    supabase: client,
    view: "admin",
    page: 1,
    pageSize: 20,
    from: 0,
    to: 19,
    sort: null,
    order: "desc",
    purpose: "conversion",
  });

  assert.equal(errorMessage, null);
  assert.deepEqual(requestedTables, ["violation_cases"]);
  assert.equal(payload?.data.length, 0);
});

test("detail service 在 violation_cases miss 后读取 videos 异常详情", async () => {
  const requestedTables: string[] = [];
  const client: DetailClientLike = {
    from(table: string) {
      requestedTables.push(table);

      if (table === "violation_cases") {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          async maybeSingle() {
            return { data: null, error: { message: "not found" } };
          },
        };
        return builder;
      }

      assert.equal(table, "videos");
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        async maybeSingle() {
          return {
            data: {
              id: "video-1",
              content: "异常文案",
              anomaly_status: "abnormal",
              punish_type: "deleted",
              platform_notice: "平台通知",
              appeal: "申诉内容",
              uploaded_at: "2026-07-15T08:00:00.000Z",
              created_at: "2026-07-15T08:00:00.000Z",
            },
            error: null,
          };
        },
      };
      return builder;
    },
  };

  const result = await loadViolationCaseDetail({
    supabase: client,
    id: "video-1",
  });

  assert.deepEqual(requestedTables, ["violation_cases", "videos"]);
  assert.equal(result.errorMessage, null);
  assert.equal(result.data?.id, "video-1");
  assert.equal(result.data?.script_text, "异常文案");
  assert.equal(result.data?.category, "deleted");
  assert.equal(result.data?.scene_description, "平台通知");
  assert.equal(result.data?.admin_conclusion, "申诉内容");
});

test("test record service 会单独读取该案例的测试记录", async () => {
  const client: DetailClientLike = {
    from(table: string) {
      assert.equal(table, "violation_test_records");

      let pendingCaseId: string | null = null;

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          if (column === "case_id") pendingCaseId = String(value);
          return builder;
        },
        order() {
          return builder;
        },
        async then(resolve: (value: unknown) => unknown) {
          return resolve({
            data: pendingCaseId === "case-1"
              ? [{ id: "test-1", case_id: "case-1", passed: true }]
              : [],
            error: null,
          });
        },
      };

      return builder as never;
    },
  };

  const result = await loadViolationCaseTestRecords({
    supabase: client,
    caseId: "case-1",
  });

  assert.equal(result.errorMessage, null);
  assert.deepEqual(result.data, [{ id: "test-1", case_id: "case-1", passed: true }]);
});
