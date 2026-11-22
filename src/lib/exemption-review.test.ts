import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPermanentExemptionAtomically,
  reopenExemptionRequestAtomically,
  reviewExemptionRequestAtomically,
  setPermanentExemptionAtomically,
} from "./exemption-review";

function createRpcClient(result: { data: unknown; error: { code?: string; message: string } | null } = { data: {}, error: null }) {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      rpc(name: string, params: Record<string, unknown>) {
        calls.push({ name, params });
        return Promise.resolve(result);
      },
    },
  };
}

test("审批统一路由到逐日 RPC，申请人、团队与授予字段由数据库推导", async () => {
  const { client, calls } = createRpcClient({ data: { request_id: "request-1" }, error: null });

  const result = await reviewExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
    decision: "approved",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "review_exemption_request_dates_atomically",
    params: {
      p_request_id: "request-1",
      p_decision: "approved",
      p_dates: null,
      p_feedback: null,
    },
  }]);
});

test("日期级审批 RPC 支持单日处理与可选反馈", async () => {
  const { client, calls } = createRpcClient({ data: { pending_count: 2 }, error: null });
  const result = await reviewExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
    decision: "rejected",
    dates: ["2026-09-03"],
    feedback: "当天安排已调整",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "review_exemption_request_dates_atomically",
    params: {
      p_request_id: "request-1",
      p_decision: "rejected",
      p_dates: ["2026-09-03"],
      p_feedback: "当天安排已调整",
    },
  }]);
});

test("日期级审批允许同意时不填写反馈并按整组处理", async () => {
  const { client, calls } = createRpcClient();
  await reviewExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
    decision: "approved",
    feedback: null,
  });
  assert.deepEqual(calls[0], {
    name: "review_exemption_request_dates_atomically",
    params: {
      p_request_id: "request-1",
      p_decision: "approved",
      p_dates: null,
      p_feedback: null,
    },
  });
});

test("申请人重新归属后，旧申请继续批准会被 RPC 以 409 拦截", async () => {
  const { client } = createRpcClient({
    data: null,
    error: { code: "P0001", message: "申请人与团队不一致" },
  });

  const result = await reviewExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-after-transfer",
    decision: "approved",
  });

  assert.deepEqual(result, {
    ok: false,
    status: 409,
    message: "申请信息已失效，请重新提交",
  });
});

test("不参与考核设置使用 Owner-only 专用 RPC", async () => {
  const { client, calls } = createRpcClient({ data: { permanent: true }, error: null });
  const result = await setPermanentExemptionAtomically({
    supabase: client as never,
    userId: "user-1",
    reason: "不参与发布考核",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "set_permanent_exemption_owner_atomically",
    params: {
      p_user_id: "user-1",
      p_reason: "不参与发布考核",
    },
  }]);
});

test("不参与考核撤销使用专用 RPC，保留临时豁免恢复语义", async () => {
  const { client, calls } = createRpcClient({ data: { cleared: true }, error: null });
  const result = await clearPermanentExemptionAtomically({
    supabase: client as never,
    userId: "user-1",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "clear_permanent_exemption_owner_atomically",
    params: {
      p_user_id: "user-1",
    },
  }]);
});

test("越权错误按 SQLSTATE 42501 映射为固定 403，不透传数据库细节", async () => {
  const rawError = { code: "42501", message: "permission denied: target team secret-team" };
  const { client } = createRpcClient({ data: null, error: rawError });
  const result = await reviewExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
    decision: "approved",
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected failure");
  assert.equal(result.status, 403);
  assert.equal(result.message, "不能操作当前管理范围外的成员");
  assert.equal(result.cause, rawError);
  assert.doesNotMatch(JSON.stringify(result), /secret-team|permission denied/);
});

test("RPC 抛出的网络或数据库异常固定返回 500", async () => {
  const rawError = new Error("relation public.secret_exemption does not exist");
  const result = await reopenExemptionRequestAtomically({
    supabase: {
      rpc() {
        throw rawError;
      },
    } as never,
    requestId: "request-1",
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected failure");
  assert.equal(result.status, 500);
  assert.equal(result.message, "豁免操作失败");
  assert.equal(result.cause, rawError);
  assert.doesNotMatch(JSON.stringify(result), /secret_exemption/);
});

test("打回 RPC 只接收申请 id，调用 reopen 函数", async () => {
  const { client, calls } = createRpcClient({ data: { request_id: "request-1", reopened: true }, error: null });
  const result = await reopenExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "reopen_exemption_request_atomically",
    params: { p_request_id: "request-1" },
  }]);
});

test("打回并发：另一管理员已处理时映射为 409 且不透传数据库细节", async () => {
  const rawError = { code: "P0001", message: "仅支持打回已审批的申请" };
  const { client } = createRpcClient({ data: null, error: rawError });
  const result = await reopenExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected failure");
  assert.equal(result.status, 409);
  assert.equal(result.message, "仅支持打回已审批的申请");
});

test("打回撞重叠 pending 申请映射为 409 业务文案", async () => {
  const rawError = { code: "23P01", message: "该成员已有重叠的待审批申请，无法打回" };
  const { client } = createRpcClient({ data: null, error: rawError });
  const result = await reopenExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected failure");
  assert.equal(result.status, 409);
  assert.equal(result.message, "该成员已有重叠的待审批申请，无法打回");
});

test("打回越权映射为 403，自审/跨范围不泄露内部细节", async () => {
  const rawError = { code: "42501", message: "permission denied: applicant owns request" };
  const { client } = createRpcClient({ data: null, error: rawError });
  const result = await reopenExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected failure");
  assert.equal(result.status, 403);
  assert.equal(result.message, "不能操作当前管理范围外的成员");
  assert.doesNotMatch(JSON.stringify(result), /owns request/);
});
