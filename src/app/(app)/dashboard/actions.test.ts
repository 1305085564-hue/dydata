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
  const requestFilters: Array<[string, unknown]> = [];
  const pendingRows = options.pendingRows ?? [];

  const requestBuilder = {
    select() {
      return this;
    },
    eq(column: string, value: unknown) {
      requestFilters.push([column, value]);
      return this;
    },
    limit() {
      const category = requestFilters.find(([column]) => column === "exemption_category")?.[1];
      const matchingRows = pendingRows.filter((row) => (
        category === undefined || row.exemption_category === category
      ));
      return Promise.resolve({ data: matchingRows, error: options.pendingError ?? null });
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
    requestFilters,
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
    pendingRows: [{ start_date: "2026-08-25", end_date: "2026-08-25", exemption_category: "leave" }],
  });

  const result = await submitExemptionRequestWithClient(
    baseInput,
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-08-25" },
  );

  assert.match(result.error ?? "", /审批中.*2026-08-25/);
  assert.equal(stub.insertedRows.length, 0);
  assert.deepEqual(stub.requestFilters, [
    ["applicant_user_id", "user-1"],
    ["request_status", "pending"],
    ["exemption_category", "leave"],
  ]);
});

test("不同分类的同一天 pending 不会阻止新的申请", async () => {
  const stub = createSupabaseStub({
    pendingRows: [{ start_date: "2026-08-25", end_date: "2026-08-25", exemption_category: "waive" }],
  });

  const result = await submitExemptionRequestWithClient(
    baseInput,
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-08-25" },
  );

  assert.equal(result.success, true);
  assert.equal(stub.insertedRows.length, 1);
});

test("同分类跨月区间重叠时列出完整的真实重叠日期", async () => {
  const stub = createSupabaseStub({
    pendingRows: [{
      start_date: "2026-08-31",
      end_date: "2026-09-02",
      exemption_category: "leave",
    }],
  });

  const result = await submitExemptionRequestWithClient(
    {
      mode: "range",
      category: "leave",
      reason: "跨月病假",
      startDate: "2026-08-30",
      endDate: "2026-09-03",
    },
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-09-03" },
  );

  assert.match(result.error ?? "", /2026-08-31、2026-09-01、2026-09-02/);
  assert.doesNotMatch(result.error ?? "", /2026-08-30/);
  assert.equal(stub.insertedRows.length, 0);
});

test("非重叠日期的多日特殊豁免会按天携带各自独立的申请原因写入", async () => {
  const stub = createSupabaseStub({});

  const result = await submitExemptionRequestWithClient(
    {
      mode: "range",
      category: "waive",
      reason: "特殊豁免申请",
      dates: ["2026-08-25", "2026-08-26"],
      dateReasons: {
        "2026-08-25": "平台故障",
        "2026-08-26": "排班调休",
      },
    },
    { supabase: stub.supabase, user: { id: "user-1", user_metadata: {} } },
    { today: "2026-08-26" },
  );

  assert.equal(result.success, true);
  assert.deepEqual(stub.insertedRows[0], [
    {
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "range",
      exemption_category: "waive",
      start_date: "2026-08-25",
      end_date: "2026-08-25",
      reason: "平台故障",
      request_status: "pending",
    },
    {
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "range",
      exemption_category: "waive",
      start_date: "2026-08-26",
      end_date: "2026-08-26",
      reason: "排班调休",
      request_status: "pending",
    },
  ]);
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
