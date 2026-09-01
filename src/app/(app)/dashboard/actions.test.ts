import assert from "node:assert/strict";
import test from "node:test";

import { submitExemptionRequestWithClient } from "./actions";

type RequestRow = Record<string, unknown>;

function createSupabaseStub(options: {
  pendingRows?: RequestRow[];
  pendingError?: { message: string } | null;
  insertError?: { message: string } | null;
  profile?: { team_id: string | null; membership_status: "active" | "archived" };
}) {
  const insertedRows: RequestRow[][] = [];
  const pendingRows = options.pendingRows ?? [];

  const requestBuilder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: pendingRows, error: options.pendingError ?? null });
    },
    insert(rows: RequestRow[]) {
      insertedRows.push(rows);
      return Promise.resolve({ error: options.insertError ?? null });
    },
  };

  const profileBuilder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve({
        data: options.profile ?? { team_id: "team-1", membership_status: "active" },
        error: null,
      });
    },
  };

  return {
    insertedRows,
    supabase: {
      from(table: string) {
        return table === "profiles" ? profileBuilder : requestBuilder;
      },
    } as never,
  };
}

const baseInput = {
  mode: "range" as const,
  category: "leave" as const,
  dates: ["2026-08-25"],
  reason: "病假",
};

test("V2 豁免提交使用 range 对象契约并原样保存 leave", async () => {
  const stub = createSupabaseStub({});

  const result = await submitExemptionRequestWithClient(
    baseInput,
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-08-25" },
  );

  assert.equal(result.success, true);
  assert.deepEqual(stub.insertedRows[0], [
    {
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "range",
      exemption_category: "leave",
      start_date: "2026-08-25",
      end_date: "2026-08-25",
      reason: "病假",
      request_status: "pending",
    },
  ]);
});

test("提交日期与审批中申请重叠时被拒绝且不写入", async () => {
  const stub = createSupabaseStub({
    pendingRows: [{ start_date: "2026-08-25", end_date: "2026-08-25" }],
  });

  const result = await submitExemptionRequestWithClient(
    baseInput,
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-08-25" },
  );

  assert.match(result.error ?? "", /审批中.*2026-08-25/);
  assert.equal(stub.insertedRows.length, 0);
});

test("已有 pending 申请但日期不重叠时允许再次提交", async () => {
  const stub = createSupabaseStub({
    pendingRows: [{ start_date: "2026-08-20", end_date: "2026-08-20" }],
  });

  const result = await submitExemptionRequestWithClient(
    baseInput,
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-08-25" },
  );

  assert.equal(result.success, true);
  assert.equal(stub.insertedRows.length, 1);
});

test("豁免申请写入失败返回前端可显示的错误", async () => {
  const stub = createSupabaseStub({ insertError: { message: "database unavailable" } });

  const result = await submitExemptionRequestWithClient(
    baseInput,
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-08-25" },
  );

  assert.equal(result.error, "提交豁免申请失败");
});

test("未入团 active 成员的 dashboard 豁免申请与 REST API 使用同一文案", async () => {
  const stub = createSupabaseStub({
    profile: { team_id: null, membership_status: "active" },
  });

  const result = await submitExemptionRequestWithClient(
    baseInput,
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-08-25" },
  );

  assert.equal(result.error, "请先申请加入团队");
  assert.equal(stub.insertedRows.length, 0);
});
