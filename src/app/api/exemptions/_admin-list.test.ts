import assert from "node:assert/strict";
import test from "node:test";

import { loadAdminExemptionList } from "./_admin-list";

test("豁免管理列表在查询层按可见申请人过滤", async () => {
  const filters: Array<{ column: string; values: unknown[] }> = [];
  const query = {
    select() {
      return this;
    },
    in(column: string, values: unknown[]) {
      filters.push({ column, values });
      return this;
    },
    order() {
      return this;
    },
    async limit() {
      return { data: [], error: null };
    },
  };

  const result = await loadAdminExemptionList({
    supabase: { from: () => query } as never,
    statuses: ["pending"],
    limit: 100,
    visibleUserIds: ["leader-1", "member-1"],
  });

  assert.deepEqual(result, { data: [] });
  assert.deepEqual(filters, [
    { column: "applicant_user_id", values: ["leader-1", "member-1"] },
    { column: "request_status", values: ["pending"] },
  ]);
});

test("豁免管理查询失败只向浏览器返回固定文案", async (t) => {
  t.mock.method(console, "error", () => {});
  const databaseError = { message: "relation public.secret_table does not exist" };
  const query = {
    select() { return this; },
    in() { return this; },
    order() { return this; },
    async limit() { return { data: null, error: databaseError }; },
  };

  const result = await loadAdminExemptionList({
    supabase: { from: () => query } as never,
    statuses: ["pending"],
    limit: 100,
    visibleUserIds: null,
  });

  assert.ok("response" in result);
  assert.equal(result.response.status, 500);
  assert.deepEqual(await result.response.json(), { error: "读取豁免申请列表失败" });
});

test("豁免列表查询携带 exemption_category 供待审/历史/行动中枢消费", async (t) => {
  t.mock.method(console, "error", () => {});
  let selectString = "";
  const query = {
    select(s: string) {
      selectString = s;
      return this;
    },
    in() { return this; },
    order() { return this; },
    async limit() {
      return {
        data: [{
          id: "req-1",
          applicant_user_id: "applicant-1",
          team_id: "team-1",
          exemption_type: "range",
          exemption_category: "leave",
          start_date: "2026-09-01",
          end_date: "2026-09-03",
          reason: "出差",
          request_status: "approved",
          reviewed_by: "reviewer-1",
          reviewed_at: "2026-09-01T08:00:00.000Z",
          created_at: "2026-08-31T08:00:00.000Z",
        }],
        error: null,
      };
    },
  };

  const result = await loadAdminExemptionList({
    supabase: {
      from: (table: string) => {
        if (table === "exemption_request") return query;
        if (table === "profiles") {
          return {
            select: () => ({ in: () => ({}) }),
          };
        }
        return {
          select: () => ({ in: () => ({ eq: () => ({ or: async () => ({ data: [] }) }) }) }),
        };
      },
    } as never,
    statuses: ["approved", "rejected"],
    limit: 50,
    visibleUserIds: ["applicant-1"],
  });

  assert.match(selectString, /exemption_category/);
  if ("response" in result) throw new Error("expected data");
  assert.equal(result.data[0].exemption_category, "leave");
});

test("后端出勤聚合：grant 跨月时只计入当月交集天数", async () => {
  const shanghaiToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const yearNum = Number(shanghaiToday.slice(0, 4));
  const monthNum = Number(shanghaiToday.slice(5, 7));
  const currentMonthPrefix = shanghaiToday.slice(0, 7);

  // 构造一条从上个月底跨入当月 5 号的请假单（当月交集恰好是 1~5 号共 5 天）
  const prevMonthStr = monthNum === 1
    ? `${yearNum - 1}-12-25`
    : `${yearNum}-${String(monthNum - 1).padStart(2, "0")}-25`;
  const crossMonthEnd = `${currentMonthPrefix}-05`;

  const reqQuery = {
    select() { return this; },
    in() { return this; },
    order() { return this; },
    async limit() {
      return {
        data: [{
          id: "req-overlap",
          applicant_user_id: "user-cross",
          team_id: "team-1",
          exemption_type: "temporary",
          exemption_category: "leave",
          start_date: `${currentMonthPrefix}-06`,
          end_date: `${currentMonthPrefix}-08`,
          reason: "请假",
          request_status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          created_at: "2026-09-01T00:00:00.000Z",
        }],
        error: null,
      };
    },
  };

  const grantQuery = {
    select() { return this; },
    in() { return this; },
    eq() { return this; },
    async or() {
      return {
        data: [
          {
            user_id: "user-cross",
            start_date: prevMonthStr,
            end_date: crossMonthEnd,
            grant_type: "range",
            exemption_category: "leave",
            status: "active",
          },
        ],
        error: null,
      };
    },
  };

  const result = await loadAdminExemptionList({
    supabase: {
      from: (table: string) => {
        if (table === "exemption_request") return reqQuery;
        if (table === "exemption_grant") return grantQuery;
        return { select: () => ({ in: () => ({ data: [] }) }) };
      },
    } as never,
    statuses: ["pending"],
    limit: 50,
    visibleUserIds: ["user-cross"],
  });

  if ("response" in result) throw new Error("expected data");
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.data[0].applicant_month_stats, {
    approved_leave_days: 5,
    approved_waived_days: 0,
  });
});

test("后端出勤聚合：permanent 计入当月全部自然日天数", async () => {
  const shanghaiToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const yearNum = Number(shanghaiToday.slice(0, 4));
  const monthNum = Number(shanghaiToday.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();

  const reqQuery = {
    select() { return this; },
    in() { return this; },
    order() { return this; },
    async limit() {
      return {
        data: [{
          id: "req-perm",
          applicant_user_id: "user-perm",
          team_id: "team-1",
          exemption_type: "permanent",
          exemption_category: "waive",
          start_date: "2026-01-01",
          end_date: null,
          reason: "长期豁免",
          request_status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          created_at: "2026-09-01T00:00:00.000Z",
        }],
        error: null,
      };
    },
  };

  const grantQuery = {
    select() { return this; },
    in() { return this; },
    eq() { return this; },
    async or() {
      return {
        data: [
          {
            user_id: "user-perm",
            start_date: "2026-01-01",
            end_date: null,
            grant_type: "permanent",
            exemption_category: "waive",
            status: "active",
          },
        ],
        error: null,
      };
    },
  };

  const result = await loadAdminExemptionList({
    supabase: {
      from: (table: string) => {
        if (table === "exemption_request") return reqQuery;
        if (table === "exemption_grant") return grantQuery;
        return { select: () => ({ in: () => ({ data: [] }) }) };
      },
    } as never,
    statuses: ["pending"],
    limit: 50,
    visibleUserIds: ["user-perm"],
  });

  if ("response" in result) throw new Error("expected data");
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.data[0].applicant_month_stats, {
    approved_leave_days: 0,
    approved_waived_days: daysInMonth,
  });
});

test("后端出勤聚合：查询报错时不填充 applicant_month_stats 字段（防止谎报 0 天）", async (t) => {
  t.mock.method(console, "error", () => {});

  const reqQuery = {
    select() { return this; },
    in() { return this; },
    order() { return this; },
    async limit() {
      return {
        data: [{
          id: "req-err",
          applicant_user_id: "user-err",
          team_id: "team-1",
          exemption_type: "temporary",
          exemption_category: "leave",
          start_date: "2026-09-10",
          end_date: "2026-09-11",
          reason: "请假",
          request_status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          created_at: "2026-09-01T00:00:00.000Z",
        }],
        error: null,
      };
    },
  };

  const failingGrantQuery = {
    select() { return this; },
    in() { return this; },
    eq() { return this; },
    async or() {
      return {
        data: null,
        error: { message: "database network timeout" },
      };
    },
  };

  const result = await loadAdminExemptionList({
    supabase: {
      from: (table: string) => {
        if (table === "exemption_request") return reqQuery;
        if (table === "exemption_grant") return failingGrantQuery;
        return { select: () => ({ in: () => ({ data: [] }) }) };
      },
    } as never,
    statuses: ["pending"],
    limit: 50,
    visibleUserIds: ["user-err"],
  });

  if ("response" in result) throw new Error("expected data");
  assert.equal(result.data.length, 1);
  // 严格断言：返回体中不包含 applicant_month_stats 属性（禁止谎报 0 天）
  assert.equal("applicant_month_stats" in result.data[0], false);
  assert.equal(result.data[0].applicant_month_stats, undefined);
});
