import assert from "node:assert/strict";
import test from "node:test";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { loadPendingExemptions } from "./fulfillment-page-queries";

type Row = Record<string, unknown>;
function memoryClient(tables: Record<string, Row[]>, fail?: { table: string; from: number }) {
  const reads: Array<{ table: string; from: number; to: number }> = [];
  const client = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let from = 0;
      let to = 999; // 模拟未分页的服务器默认上限，回归时会真的丢记录。
      const order: Array<{ key: string; ascending: boolean }> = [];
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
        in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query; },
        lte(key: string, value: string) { rows = rows.filter(row => String(row[key]) <= value); return query; },
        or() { return query; },
        order(key: string, options?: { ascending?: boolean }) { order.push({ key, ascending: options?.ascending ?? true }); return query; },
        range(start: number, end: number) { from = start; to = end; return query; },
        abortSignal() { return query; },
        then(resolve: (result: { data: Row[] | null; error: { message: string } | null }) => unknown) {
          reads.push({ table, from, to });
          if (fail?.table === table && fail.from === from) return Promise.resolve({ data: null, error: { message: "第二页读取失败" } }).then(resolve);
          const sorted = rows.toSorted((a, b) => {
            for (const rule of order) {
              const compared = String(a[rule.key] ?? "").localeCompare(String(b[rule.key] ?? ""));
              if (compared) return rule.ascending ? compared : -compared;
            }
            return 0;
          });
          return Promise.resolve({ data: sorted.slice(from, to + 1), error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  return { client: client as never, reads };
}

const id = (index: number) => `member-${String(index).padStart(4, "0")}`;

test("成员权限范围读取 2501 人跨三页完整保留，其他团队仍被排除", async () => {
  const profiles = Array.from({ length: 2501 }, (_, index) => ({ id: id(index), team_id: "team-a", membership_status: "active" }));
  const { client, reads } = memoryClient({ profiles: [...profiles, { id: "outsider", team_id: "team-b", membership_status: "active" }] });
  const scope = await buildDataAccessScope(client, id(0), { profile: { id: id(0), role: "admin", team_id: "team-a", membership_status: "active", data_scope: "team", permissions: {} } });
  assert.deepEqual(scope?.visibleUserIds, profiles.map(row => row.id));
  assert.deepEqual(scope?.activeVisibleUserIds, profiles.map(row => row.id));
  assert.equal(reads.filter(row => row.from === 2000).length, 2);
});

function pendingFixture() {
  const requests = Array.from({ length: 1501 }, (_, index) => ({
    id: `request-${String(index).padStart(4, "0")}`, applicant_user_id: "member-0000", team_id: "team-a", request_status: "pending",
    exemption_type: "range", start_date: "2026-11-01", end_date: "2026-11-02", reason: "原申请", created_at: "2026-11-01",
  }));
  const details = requests.flatMap((row, index) => [
    { id: `${index}-a`, request_id: row.id, request_date: "2026-11-01", status: "pending", reason: "第一天" },
    { id: `${index}-b`, request_id: row.id, request_date: "2026-11-02", status: "pending", reason: "第二天" },
  ]);
  return { exemption_request: requests, exemption_request_date: details };
}
const pendingInput = { startDate: "2026-11-01", endDate: "2026-11-30", visibleUserIds: ["member-0000"], teamId: "team-a" };

test("履约待审1501单与3002条逐日明细均读取完整，审批日期不重不漏", async () => {
  const { client, reads } = memoryClient(pendingFixture());
  const result = await loadPendingExemptions(client, pendingInput);
  assert.equal(result.length, 3002);
  assert.equal(new Set(result.map(row => `${row.id}:${row.start_date}`)).size, 3002);
  assert.equal(result.filter(row => row.start_date === "2026-11-02" && row.reason === "第二天").length, 1501);
  assert.deepEqual(reads.filter(row => row.table === "exemption_request_date").map(row => row.from), [0, 1000, 2000, 3000]);
});

test("待审逐日明细第二页故障时明确失败，不交付残缺审批队列", async () => {
  const { client } = memoryClient(pendingFixture(), { table: "exemption_request_date", from: 1000 });
  await assert.rejects(loadPendingExemptions(client, pendingInput), /第二页读取失败/);
});
