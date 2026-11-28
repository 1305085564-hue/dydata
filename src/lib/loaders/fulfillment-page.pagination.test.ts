import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { loadFulfillmentCalendar } from "./fulfillment-page";

const userIds = Array.from({ length: 51 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
const teamId = "10000000-0000-4000-8000-000000000001";
const rpcRows = userIds.flatMap(user_id => Array.from({ length: 30 }, (_, day) => ({
  user_id, user_name: "同名成员", team_id: teamId, team_name: "本公司", group_name: null,
  record_date: `2026-06-${String(day + 1).padStart(2, "0")}`, status: "published", reason: null,
  marked_by_name: null, published_count: 1, consecutive_missing: 0,
})));

type RpcRequest = { offset: number; limit: number; order: string | null; args: unknown };
function serveCalendar(t: TestContext, failSecondPage = false) {
  const previousEnv = process.env.CLOUDBASE_ENV_ID;
  const previousKey = process.env.CLOUDBASE_SERVICE_API_KEY;
  process.env.CLOUDBASE_ENV_ID = "paged-fulfillment-test";
  process.env.CLOUDBASE_SERVICE_API_KEY = "fake-test-key";
  t.after(() => {
    if (previousEnv === undefined) delete process.env.CLOUDBASE_ENV_ID;
    else process.env.CLOUDBASE_ENV_ID = previousEnv;
    if (previousKey === undefined) delete process.env.CLOUDBASE_SERVICE_API_KEY;
    else process.env.CLOUDBASE_SERVICE_API_KEY = previousKey;
  });
  const rpcRequests: RpcRequest[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "paged-fulfillment-test.api.tcloudbasegateway.com");
    if (url.pathname.endsWith("/rpc/get_fulfillment_range")) {
      assert.equal(request.method, "POST");
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      rpcRequests.push({ offset, limit, order: url.searchParams.get("order"), args: await request.json() });
      if (failSecondPage && offset === 1000) return Response.json({ message: "第二页不可用", code: "PGRST000" }, { status: 503 });
      return Response.json(rpcRows.slice(offset, offset + limit));
    }
    assert.equal(request.method, "GET");
    if (url.pathname.endsWith("/profiles")) return Response.json(userIds.map(id => ({ id, team_id: teamId })));
    if (url.pathname.endsWith("/teams")) return Response.json([{ id: teamId, name: "本公司" }]);
    if (url.pathname.endsWith("/exemption_request")) return Response.json([]);
    throw new Error(`非预期数据库请求：${url.pathname}`);
  });
  return rpcRequests;
}
const options = { year: 2026, month: 6, visibleUserIds: userIds, teamId, fresh: true };

test("发布管理通过真实 SDK 分页读取1530条成员日期行，完整生成51人的整月履约", async t => {
  const requests = serveCalendar(t);
  const data = await loadFulfillmentCalendar(options);
  assert.equal(data.members.length, 51);
  assert.equal(data.members.reduce((sum, member) => sum + Object.keys(member.days).length, 0), 1530);
  assert.equal(data.stats.publishedCount, 1530);
  assert.ok(data.members.every(member => member.publishedDays === 30));
  assert.deepEqual(data.members.map(member => member.userId), userIds);
  assert.deepEqual(requests.map(request => [request.offset, request.limit]), [[0, 1000], [1000, 1000]]);
  for (const request of requests) {
    assert.equal(request.order, "team_name.asc.nullslast,group_name.asc.nullslast,user_name.asc,user_id.asc,record_date.asc");
    assert.deepEqual(request.args, { p_start_date: "2026-06-01", p_end_date: "2026-06-30", p_visible_user_ids: userIds, p_team_id: teamId });
  }
});

test("履约RPC第二页故障时公开日历加载明确失败，不返回前1000行形成的残缺统计", async t => {
  const requests = serveCalendar(t, true);
  await assert.rejects(loadFulfillmentCalendar(options), /第二页不可用/);
  assert.deepEqual(requests.map(request => request.offset), [0, 1000]);
});
