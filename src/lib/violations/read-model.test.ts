import test from "node:test";
import assert from "node:assert/strict";

import {
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
