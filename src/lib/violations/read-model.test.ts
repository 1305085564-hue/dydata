import test from "node:test";
import assert from "node:assert/strict";

import {
  loadViolationCaseDetail,
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
