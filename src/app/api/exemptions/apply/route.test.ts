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
      filters.length = 0;
      return exemptionRequestBuilder;
    },
  };
}

function deps(
  rows: ExemptionRow[],
  userId = "user-1",
  profile?: { id: string; team_id: string | null; membership_status: "active" | "archived" },
) {
  const supabase = mockSupabase(rows, profile);
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
  assert.equal(body.data.request_status, "pending");
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
