import assert from "node:assert/strict";
import test from "node:test";

import {
  applyExemptionGrantAtomically,
  clearExemptionGrantAtomically,
  reviewExemptionRequestAtomically,
} from "./exemption-review";
import { buildGrantDraft } from "./豁免流程";

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

test("手工设置豁免 RPC 不接收可伪造的操作者、团队和 profile 投影", async () => {
  const { client, calls } = createRpcClient();
  const draft = buildGrantDraft({
    userId: "user-1",
    teamId: "untrusted-team-from-browser",
    mode: "range",
    category: "waive",
    reason: "出差",
    requestId: null,
    today: "2026-07-18",
    startDate: "2026-07-18",
    endDate: "2026-07-20",
  });

  const result = await applyExemptionGrantAtomically({
    supabase: client as never,
    draft,
    replaceExisting: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "apply_exemption_grant_atomically",
    params: {
      p_user_id: "user-1",
      p_grant_start_date: "2026-07-18",
      p_grant_end_date: "2026-07-20",
      p_grant_type: "range",
      p_exemption_category: "waive",
      p_reason: "出差",
      p_replace_existing: true,
    },
  }]);
  assert.doesNotMatch(JSON.stringify(calls), /p_actor|p_reviewer|p_team_id|p_profile_/);
});

test("审核 RPC 只接收申请 id 和决定，申请人、团队与授予字段由数据库推导", async () => {
  const { client, calls } = createRpcClient({ data: { request_id: "request-1" }, error: null });

  const result = await reviewExemptionRequestAtomically({
    supabase: client as never,
    requestId: "request-1",
    decision: "approved",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "review_exemption_request_atomically",
    params: {
      p_request_id: "request-1",
      p_decision: "approved",
    },
  }]);
});

test("清除豁免通过单个 RPC 原子更新 grant 与 profile", async () => {
  const { client, calls } = createRpcClient();
  const result = await clearExemptionGrantAtomically({
    supabase: client as never,
    userId: "user-1",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    name: "clear_exemption_grant_atomically",
    params: { p_user_id: "user-1" },
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
  const result = await clearExemptionGrantAtomically({
    supabase: {
      rpc() {
        throw rawError;
      },
    } as never,
    userId: "user-1",
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected failure");
  assert.equal(result.status, 500);
  assert.equal(result.message, "豁免操作失败");
  assert.equal(result.cause, rawError);
  assert.doesNotMatch(JSON.stringify(result), /secret_exemption/);
});
