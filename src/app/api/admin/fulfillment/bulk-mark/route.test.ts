import assert from "node:assert/strict";
import test from "node:test";

import { buildFulfillmentBulkMarkResponse } from "./route";

const UID = "123e4567-e89b-42d3-a456-426614174000";
const REQ_ID = "11111111-1111-4111-8111-111111111112";

function deps(result: { data: unknown; error: unknown } | Error) {
  return {
    requireAdminServiceClient: async () => ({
      actor: { userId: "admin-1", role: "admin", companyRole: "admin", name: "管理员" },
      scope: { activeVisibleUserIds: [UID], visibleUserIds: [UID], kind: "team" },
      supabase: { rpc: async () => (result instanceof Error ? Promise.reject(result) : result) },
      userSupabase: { rpc: () => { throw new Error("履约标记不向本人连接开放"); } },
    }) as never,
    requireOwnerOrAdminRole: () => null,
    requireActiveVisibleUsers: () => null,
  } as never;
}

test("bulk-mark RPC 失败或抛错时脱敏返回公共中文 + requestId 并写服务端日志", async () => {
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const rpcFail = await buildFulfillmentBulkMarkResponse(
      { userIds: [UID], recordDate: "2026-10-01", status: "leave", reason: "请假" },
      deps({ data: null, error: { message: 'permission denied for table "fulfillment_records"' } }),
      { requestId: REQ_ID, mark: () => {}, setDetail: () => {} },
    );
    assert.equal(rpcFail.status, 500);
    assert.equal(rpcFail.headers.get("x-dydata-request-id"), REQ_ID);
    const rpcBody = await rpcFail.json();
    assert.equal(rpcBody.requestId, REQ_ID);
    assert.match(rpcBody.error, /^批量标记发布管理状态失败（编号：/);
    assert.doesNotMatch(rpcBody.error, /fulfillment_records|permission denied/);

    const thrown = await buildFulfillmentBulkMarkResponse(
      { userIds: [UID], recordDate: "2026-10-01", status: "leave", reason: "请假" },
      deps(new Error("socket hang up internal-db")),
      { requestId: REQ_ID, mark: () => {}, setDetail: () => {} },
    );
    assert.equal(thrown.status, 500);
    const thrownBody = await thrown.json();
    assert.equal(thrownBody.requestId, REQ_ID);
    assert.doesNotMatch(thrownBody.error, /socket hang up|internal-db/);
    assert.ok(logs.some((line) => line.includes(REQ_ID)));
  } finally {
    console.error = originalError;
  }
});
