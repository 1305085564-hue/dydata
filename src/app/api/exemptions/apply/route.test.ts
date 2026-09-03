import assert from "node:assert/strict";
import test from "node:test";

import { buildApplyExemptionResponse } from "./route";

type ExemptionRow = {
  id: string;
  applicant_user_id: string;
  team_id: string;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
  exemption_category?: "waive" | "leave" | null;
  request_status: "pending" | "approved" | "rejected";
};

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/exemptions/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertResponse<T>(r: T | undefined): T {
  assert.ok(r != null);
  return r;
}

function mockSupabase(
  rows: ExemptionRow[],
  profile: { id: string; team_id: string | null; membership_status: "active" | "archived" } = {
    id: "user-1",
    team_id: "team-1",
    membership_status: "active",
  },
  requestDateRows: Array<{ request_id: string; request_date: string; status: "pending" | "approved" | "rejected" }> = [],
) {
  const filters: Array<{ col: string; op: string; value: unknown }> = [];

  function applyFilters() {
    return rows.filter((row) =>
      filters.every((f) => {
        const rowValue = (row as Record<string, unknown>)[f.col];
        if (f.col === "exemption_category" && f.value === "waive" && rowValue == null) return true;
        if (f.op === "is") return rowValue === f.value;
        return rowValue === f.value;
      }),
    );
  }

  const exemptionRequestBuilder = {
    select() {
      return this;
    },
    eq(col: string, value: unknown) {
      filters.push({ col, op: "eq", value });
      return this;
    },
    is(col: string, value: unknown) {
      filters.push({ col, op: "is", value });
      return this;
    },
    order() {
      return this;
    },
    async limit() {
      return { data: applyFilters(), error: null };
    },
    insert(row: Partial<ExemptionRow>) {
      const inserted: ExemptionRow = {
        id: `new-${rows.length + 1}`,
        applicant_user_id: row.applicant_user_id as string,
        team_id: row.team_id as string,
        exemption_type: row.exemption_type as string,
        start_date: row.start_date as string,
        end_date: (row.end_date as string | null) ?? null,
        exemption_category: (row.exemption_category as "waive" | "leave" | null) ?? "waive",
        request_status: "pending",
      };
      rows.push(inserted);
      return {
        select() {
          return this;
        },
        async single() {
          return { data: inserted, error: null };
        },
      };
    },
  };

  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async single() {
            return { data: profile, error: null };
          },
        };
      }
      if (table === "exemption_request_date") {
        return {
          select() {
            return this;
          },
          async in() {
            return { data: requestDateRows, error: null };
          },
          async insert() {
            return { error: null };
          },
          async delete() {
            return { error: null };
          },
        };
      }
      filters.length = 0;
      return exemptionRequestBuilder;
    },
  };
}

function deps(
  rows: ExemptionRow[],
  userId = "user-1",
  profile?: { id: string; team_id: string | null; membership_status: "active" | "archived" },
  requestDateRows?: Array<{ request_id: string; request_date: string; status: "pending" | "approved" | "rejected" }>,
) {
  const supabase = mockSupabase(rows, profile, requestDateRows);
  return {
    requireSignedInUser: async () => ({ supabase: supabase as never, user: { id: userId } as never }),
  };
}

const basePayload = {
  exemption_type: "single",
  start_date: "2026-07-29",
  end_date: null,
  reason: "测试申请",
};

test("首次提交豁免申请成功创建", async () => {
  const rows: ExemptionRow[] = [];
  const res = assertResponse(await buildApplyExemptionResponse(request(basePayload), deps(rows)));
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.ok(Array.isArray(body.data));
  assert.equal(body.data[0].request_status, "pending");
});

test("非连续日期拆成多段申请，段间不留幻影区间", async () => {
  const rows: ExemptionRow[] = [];
  const res = assertResponse(await buildApplyExemptionResponse(
    request({
      exemption_type: "range",
      exemption_category: "waive",
      start_date: "2026-07-01",
      end_date: "2026-07-05",
      reason: "",
      dates: ["2026-07-01", "2026-07-02", "2026-07-05"],
      date_reasons: {
        "2026-07-01": "甲",
        "2026-07-02": "乙",
        "2026-07-05": "丙",
      },
    }),
    deps(rows),
  ));
  const body = await res.json();

  assert.equal(res.status, 201);
  // 拆成 [1-2] 与 [5] 两段，而不是撑成 [1-5] 的整段区间。
  assert.equal(body.data.length, 2);
  assert.deepEqual(
    body.data.map((r: ExemptionRow) => [r.start_date, r.end_date]),
    [["2026-07-01", "2026-07-02"], ["2026-07-05", "2026-07-05"]],
  );
});

test("同一申请人同团队同类型同日期且仍 pending 时拒绝重复提交", async () => {
  const rows: ExemptionRow[] = [
    {
      id: "existing-1",
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "single",
      start_date: "2026-07-29",
      end_date: null,
      request_status: "pending",
    },
  ];
  const res = assertResponse(await buildApplyExemptionResponse(request(basePayload), deps(rows)));
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.match(body.error, /已有重叠的待处理申请/);
});

test("不同日期的 pending 申请不会被误拦截", async () => {
  const rows: ExemptionRow[] = [
    {
      id: "existing-1",
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "single",
      start_date: "2026-07-01",
      end_date: null,
      request_status: "pending",
    },
  ];
  const res = assertResponse(await buildApplyExemptionResponse(request(basePayload), deps(rows)));

  assert.equal(res.status, 201);
});

test("同分类同日期的 pending 申请即使类型不同也会被拦截", async () => {
  const rows: ExemptionRow[] = [
    {
      id: "existing-1",
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "3days",
      start_date: "2026-07-29",
      end_date: null,
      request_status: "pending",
    },
  ];
  const res = assertResponse(await buildApplyExemptionResponse(request(basePayload), deps(rows)));

  assert.equal(res.status, 409);
});

test("已审批或已拒绝的历史申请不会阻止重新申请相同日期和类型", async () => {
  const rowsApproved: ExemptionRow[] = [
    {
      id: "existing-1",
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "single",
      start_date: "2026-07-29",
      end_date: null,
      request_status: "approved",
    },
  ];
  const resApproved = assertResponse(await buildApplyExemptionResponse(request(basePayload), deps(rowsApproved)));
  assert.equal(resApproved.status, 201);

  const rowsRejected: ExemptionRow[] = [
    {
      id: "existing-2",
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "single",
      start_date: "2026-07-29",
      end_date: null,
      request_status: "rejected",
    },
  ];
  const resRejected = assertResponse(await buildApplyExemptionResponse(request(basePayload), deps(rowsRejected)));
  assert.equal(resRejected.status, 201);
});

test("部分处理后仍 pending 的申请只拦逐日明细里的待审日期", async () => {
  const rows: ExemptionRow[] = [{
    id: "request-partial",
    applicant_user_id: "user-1",
    team_id: "team-1",
    exemption_type: "range",
    start_date: "2026-07-29",
    end_date: "2026-07-31",
    request_status: "pending",
  }];

  const res = assertResponse(await buildApplyExemptionResponse(
    request({
      exemption_type: "single",
      start_date: "2026-07-30",
      end_date: null,
      reason: "重提已拒绝日期",
    }),
    deps(rows, "user-1", undefined, [
      { request_id: "request-partial", request_date: "2026-07-29", status: "approved" },
      { request_id: "request-partial", request_date: "2026-07-30", status: "rejected" },
      { request_id: "request-partial", request_date: "2026-07-31", status: "pending" },
    ]),
  ));

  assert.equal(res.status, 201);
});

test("同分类重叠区间会被预检拦截", async () => {
  const rangePayload = {
    exemption_type: "range",
    start_date: "2026-07-29",
    end_date: "2026-08-01",
    reason: "区间豁免",
  };
  const rows: ExemptionRow[] = [
    {
      id: "existing-1",
      applicant_user_id: "user-1",
      team_id: "team-1",
      exemption_type: "range",
      start_date: "2026-07-29",
      end_date: "2026-08-05",
      request_status: "pending",
    },
  ];
  const res = assertResponse(await buildApplyExemptionResponse(request(rangePayload), deps(rows)));

  assert.equal(res.status, 409);
});

test("同分类跨月重叠区间会被预检拦截", async () => {
  const rows: ExemptionRow[] = [{
    id: "existing-cross-month",
    applicant_user_id: "user-1",
    team_id: "team-1",
    exemption_type: "range",
    start_date: "2026-08-31",
    end_date: "2026-09-02",
    request_status: "pending",
  }];

  const res = assertResponse(await buildApplyExemptionResponse(request({
    exemption_type: "range",
    start_date: "2026-08-30",
    end_date: "2026-09-03",
    reason: "跨月豁免",
  }), deps(rows)));

  assert.equal(res.status, 409);
});

test("未入团 active 成员申请豁免时拒绝且不新增申请行", async () => {
  const rows: ExemptionRow[] = [];
  const res = assertResponse(await buildApplyExemptionResponse(
    request(basePayload),
    deps(rows, "user-1", { id: "user-1", team_id: null, membership_status: "active" }),
  ));
  const body = await res.json();

  assert.equal(res.status, 403);
  assert.deepEqual(body, {
    error: "请先申请加入团队",
    code: "TEAM_MEMBERSHIP_REQUIRED",
  });
  assert.equal(rows.length, 0);
});

test("豁免申请主理由超长时拒绝，不能静默截断", async () => {
  const rows: ExemptionRow[] = [];
  const res = assertResponse(await buildApplyExemptionResponse(
    request({
      ...basePayload,
      reason: "超".repeat(501),
    }),
    deps(rows),
  ));
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /豁免理由不能超过 500 个字符/);
  assert.equal(rows.length, 0);
});

test("逐日豁免原因超长时拒绝，不能静默截断", async () => {
  const rows: ExemptionRow[] = [];
  const res = assertResponse(await buildApplyExemptionResponse(
    request({
      exemption_type: "range",
      exemption_category: "waive",
      start_date: "2026-07-01",
      end_date: "2026-07-02",
      reason: "",
      dates: ["2026-07-01", "2026-07-02"],
      date_reasons: {
        "2026-07-01": "正常原因",
        "2026-07-02": "超".repeat(501),
      },
    }),
    deps(rows),
  ));
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /逐日豁免原因不能超过 500 个字符/);
  assert.equal(rows.length, 0);
});
