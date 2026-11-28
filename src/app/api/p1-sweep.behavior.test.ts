import { pagedQueryDouble } from "@/lib/testing/paged-query-double";
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { buildExportResponse } from "./export/route";
import { buildAppealStatusResponse } from "./fulfillment/appeal-status/route";
import { buildNotificationCleanupResponse } from "./notifications/cleanup/route";
import { buildUsageEventResponse } from "./usage-events/route";
import { buildFulfillmentAppealsGetResponse } from "./admin/fulfillment/appeals/route";
import { saveOwnAccountUpdate } from "@/lib/account-updates";
import { fetchFulfillmentAppeals } from "@/lib/fulfillment/data/workbench";

type Row = Record<string, unknown>;
// 数据库边界保留筛选、排序、实际分页上限与更新行数；不替换业务函数。
function database(tables: Record<string, Row[]>, options: { cap?: number; emptyAfter?: number; failPage?: boolean } = {}) {
  const ranges: number[] = [];
  const orders: string[][] = [];
  return {
    ranges, orders,
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const sorting: Array<{ key: string; ascending: boolean }> = [];
      let start = 0; let end = Infinity; let head = false; let patch: Row | null = null;
      const execute = (single = false) => {
        let rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        if (head) return { data: null, error: null, count: rows.length };
        if (options.failPage) return { data: null, error: { message: "page unavailable" } };
        rows = [...rows].sort((a, b) => {
          for (const order of sorting) {
            const compared = String(a[order.key]).localeCompare(String(b[order.key]));
            if (compared) return order.ascending ? compared : -compared;
          }
          return 0;
        });
        rows = options.emptyAfter !== undefined && start >= options.emptyAfter ? [] : rows.slice(start, Math.min(end + 1, start + (options.cap ?? Infinity)));
        if (patch) rows.forEach((row) => Object.assign(row, patch));
        return { data: single ? rows[0] ?? null : rows.map((row) => ({ ...row })), error: null };
      };
      const query = {
        select(_columns?: string, config?: { head?: boolean }) { head = config?.head === true; return query; },
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
        order(key: string, config: { ascending: boolean }) { sorting.push({ key, ascending: config.ascending }); return query; },
        range(from: number, to: number) { start = from; end = to; ranges.push(from); orders.push(sorting.map((order) => order.key)); return query; },
        limit(value: number) { end = value - 1; return query; },
        update(value: Row) { patch = value; return query; },
        maybeSingle: async () => execute(true),
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(execute()).then(resolve); },
      };
      return pagedQueryDouble(query);
    },
  };
}

function exportDeps(db: ReturnType<typeof database>) {
  return {
    createClient: async () => db as never,
    createAdminClient: () => db as never,
    getUserPermissions: async () => ({ userId: "user-1", role: "member", companyRole: "member", permissions: { export_data: true }, dataScope: "self", teamId: null }) as never,
  };
}
const reports = () => Array.from({ length: 1500 }, (_, i) => ({
  id: String(i).padStart(4, "0"), user_id: "user-1", is_void: false, title: `作品${i}`,
  report_date: "2026-11-27", published_at: "2026-11-27T00:00:00Z", submitter: "本人", play_count: 100,
}));

test("05：网关每页只返回1000行时，1500条导出完整且排序包含唯一键，列模板保持17列", async () => {
  const db = database({ daily_reports: reports() }, { cap: 1000 });
  const response = await buildExportResponse(new NextRequest("https://example.com/api/export"), exportDeps(db));
  assert.equal(response.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 1501);
  assert.equal(sheet.columnCount, 17);
  assert.equal(new Set(sheet.getColumn(3).values.slice(2)).size, 1500);
  assert.deepEqual(db.ranges, [0, 1000]);
  assert.ok(db.orders.every((keys) => keys.at(-1) === "id"));
});

test("05：提前读到空页或读取失败时明确报错，不返回残缺附件", async () => {
  for (const options of [{ cap: 1000, emptyAfter: 1000 }, { failPage: true }]) {
    const db = database({ daily_reports: reports() }, options);
    const response = await buildExportResponse(new NextRequest("https://example.com/api/export"), exportDeps(db));
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("content-disposition"), null);
    assert.match((await response.json()).error, /导出数据/);
  }
});

test("11：同账号同日较新的事后已批准单不遮住旧前置续交状态", async () => {
  const db = database({ fulfillment_appeals: [
    { id: "post", user_id: "user-1", account_id: "account", record_date: "2026-11-27", review_mode: "post_submit", status: "approved", submission_payload: {}, created_at: "2026-11-28" },
    { id: "pre", user_id: "user-1", account_id: "account", record_date: "2026-11-27", review_mode: "pre_submit", status: "approved", submission_payload: {}, created_at: "2026-11-27" },
  ], notifications: [] });
  const deps = { createClient: async () => db as never, createAdminClient: () => db as never };
  const request = () => new NextRequest("https://example.com/api/fulfillment/appeal-status?accountId=account&recordDate=2026-11-27");
  const body = await (await buildAppealStatusResponse(request(), deps)).json();
  assert.equal(body.appeal.id, "pre");
  assert.equal(body.appeal.resumePending, true);
  const onlyPost = database({ fulfillment_appeals: [{ id: "post", user_id: "user-1", account_id: "account", record_date: "2026-11-27", review_mode: "post_submit", status: "approved", submission_payload: {} }] });
  assert.deepEqual(await (await buildAppealStatusResponse(request(), { createClient: async () => onlyPost as never, createAdminClient: () => onlyPost as never })).json(), { appeal: null });
});

function appealsDeps(db: ReturnType<typeof database>) {
  return {
    requireAdminServiceClient: async () => ({ supabase: db, scope: { visibleUserIds: ["user-1", "archived"], activeVisibleUserIds: ["user-1"] } }) as never,
    requireOwnerOrAdminRole: () => null,
  };
}

test("18：150条新已处理记录不挤掉旧待审；待审分页取全并排除归档人，已处理保留归档历史", async () => {
  const rows: Row[] = [
    ...Array.from({ length: 151 }, (_, i) => ({ id: `pending-${i}`, user_id: "user-1", status: "pending", created_at: "2026-01-01" })),
    { id: "archived-pending", user_id: "archived", status: "pending", created_at: "2026-11-28" },
    { id: "archived-handled", user_id: "archived", status: "approved", created_at: "2026-11-28" },
    ...Array.from({ length: 150 }, (_, i) => ({ id: `handled-${i}`, user_id: "user-1", status: "approved", created_at: "2026-11-27" })),
  ];
  const db = database({ fulfillment_appeals: rows, profiles: [] }, { cap: 50 });
  const appeals = await fetchFulfillmentAppeals(async (url) => buildFulfillmentAppealsGetResponse(new NextRequest(new URL(String(url), "https://example.com")), appealsDeps(db)));
  assert.equal(appeals.filter((appeal) => appeal.status === "pending").length, 151);
  assert.equal(appeals.some((appeal) => appeal.id === "archived-pending"), false);
  assert.equal(appeals.some((appeal) => appeal.id === "archived-handled"), true);
  assert.equal((await buildFulfillmentAppealsGetResponse(new NextRequest("https://example.com/api/admin/fulfillment/appeals?status=all"), appealsDeps(db))).status, 400);
});

for (const patch of [{ name: "新名称" }, { remark: "新备注" }, { remark: null }]) {
  test(`22：本人账号保存检查命中行数，缺失/他人账号明确未保存 ${JSON.stringify(patch)}`, async () => {
    const tables = { accounts: [{ id: "mine", profile_id: "user-1", name: "旧名称", remark: "旧备注" }, { id: "other", profile_id: "other", name: "其他" }] };
    const db = database(tables);
    assert.deepEqual(await saveOwnAccountUpdate(db as never, "user-1", "mine", patch), { success: true });
    for (const id of ["missing", "other"]) assert.match((await saveOwnAccountUpdate(db as never, "user-1", id, patch)).error ?? "", /未保存/);
    assert.equal(tables.accounts[1].name, "其他");
  });
}

for (const failingRpc of ["cleanup_expired_notifications", "cleanup_ocr_recognition_logs", "cleanup_ai_call_attempts"]) {
  test(`24：${failingRpc} 返回SDK error时清理如实报错并记录失败项`, async () => {
    const alerts: string[] = [];
    const response = await buildNotificationCleanupResponse(new NextRequest("https://example.com/api/notifications/cleanup"), {
      isCronAuthorized: () => true,
      createAdminClient: () => ({ rpc: async (name: string) => ({ data: name === failingRpc ? null : 3, error: name === failingRpc ? { message: `${name} failed` } : null }) }) as never,
      reportCronFailure: async (title: string) => { alerts.push(title); },
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.notEqual(body.ok, true);
    assert.equal(alerts.length, 1);
    if (failingRpc !== "cleanup_expired_notifications") assert.equal(body.failures.length, 1);
  });
}

test("24：使用埋点落库返回SDK error时不回执成功", async () => {
  const response = await buildUsageEventResponse(new Request("https://example.com/api/usage-events", {
    method: "POST", body: JSON.stringify({ eventType: "page_view", path: "/dashboard" }),
  }), {
    getCurrentUserContext: async () => ({ user: { id: "user-1" } }) as never,
    createAdminClient: () => ({ from: () => pagedQueryDouble(({ insert: async () => ({ data: null, error: { message: "unavailable" } }) })) }) as never,
  });
  assert.deepEqual(await response.json(), { ok: false, skipped: true });
});
