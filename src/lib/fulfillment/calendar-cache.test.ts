import assert from "node:assert/strict";
import test from "node:test";
import { cachedFulfillmentCalendar, clearFulfillmentCalendarCache } from "./calendar-cache";
import type { FulfillmentCalendarData } from "@/types/fulfillment";
import { createCloudBaseFetch } from "@/lib/cloudbase/data-client";

const scope = { companyId: "company-a", visibleUserIds: ["a", "b"], year: 2026, month: 10, startDate: "2026-10-01", endDate: "2026-10-31", today: "2026-11-25" };
const payload = { year: 2026, month: 10 } as FulfillmentCalendarData;

test("同公司同月同权限 60 秒内复用，权限或公司不同重新查询", async (t) => {
  clearFulfillmentCalendarCache();
  t.mock.timers.enable({ apis: ["Date"], now: 1_000 });
  let calls = 0;
  const load = async () => { calls++; return payload; };
  await cachedFulfillmentCalendar(scope, load);
  await cachedFulfillmentCalendar({ ...scope, visibleUserIds: ["b", "a"] }, load);
  assert.equal(calls, 1);
  await cachedFulfillmentCalendar({ ...scope, companyId: "company-b" }, load);
  await cachedFulfillmentCalendar({ ...scope, visibleUserIds: ["a"] }, load);
  assert.equal(calls, 3);
  t.mock.timers.tick(60_000);
  await cachedFulfillmentCalendar(scope, load);
  assert.equal(calls, 4);
});

test("实际写入成功即失效，拒绝写入及浏览记录不冲掉月历缓存", async () => {
  clearFulfillmentCalendarCache();
  process.env.CLOUDBASE_ENV_ID = "cache-test";
  let calls = 0;
  const load = async () => { calls++; return payload; };
  await cachedFulfillmentCalendar(scope, load);
  const send = createCloudBaseFetch({ role: "user", userToken: "test-token", fetcher: async () => Response.json({ ok: true }) });
  await send("https://adapter.invalid/rest/v1/usage_events", { method: "POST", body: "{}" });
  await cachedFulfillmentCalendar(scope, load);
  assert.equal(calls, 1);
  const rejected = createCloudBaseFetch({ role: "user", userToken: "test-token", fetcher: async () => Response.json({}, { status: 403 }) });
  await rejected("https://adapter.invalid/rest/v1/rpc/mark_fulfillment_status", { method: "POST", body: "{}" });
  await cachedFulfillmentCalendar(scope, load);
  assert.equal(calls, 1);
  for (const resource of ["rpc/mark_fulfillment_status", "rpc/review_exemption_request_dates_atomically", "daily_reports"]) {
    await send(`https://adapter.invalid/rest/v1/${resource}`, { method: "POST", body: "{}" });
    await cachedFulfillmentCalendar(scope, load);
  }
  assert.equal(calls, 4);
});

test("写入失效期间在途旧查询不回填，失败不缓存，手动刷新重新取数", async () => {
  clearFulfillmentCalendarCache();
  let complete!: (value: FulfillmentCalendarData) => void;
  const pending = cachedFulfillmentCalendar(scope, () => new Promise(resolve => { complete = resolve; }));
  clearFulfillmentCalendarCache();
  complete(payload);
  await pending;
  await assert.rejects(cachedFulfillmentCalendar(scope, async () => { throw new Error("offline"); }), /offline/);
  let calls = 0;
  const load = async () => { calls++; return payload; };
  await cachedFulfillmentCalendar(scope, load);
  await cachedFulfillmentCalendar(scope, load, true);
  assert.equal(calls, 2);
});
