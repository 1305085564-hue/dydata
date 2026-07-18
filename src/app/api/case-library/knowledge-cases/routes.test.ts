import test from "node:test";
import assert from "node:assert/strict";

import { buildEnrichAndVerifyKnowledgeCaseResponse } from "./[id]/enrich-verify/route";
import { buildRequestKnowledgeCaseSupplementResponse } from "./[id]/request-supplement/route";

function unwrapSuccessfulRpc<T>(result: { data: T | null }) {
  if (result.data === null) throw new Error("测试 RPC 未返回数据");
  return { data: result.data };
}

test("enrich verify route 缺少 hook_text 时返回 400", async () => {
  const response = await buildEnrichAndVerifyKnowledgeCaseResponse("case-1", {
    admin_insight: "这条案例的高转化点在开头冲突。",
  });

  assert.equal(response!.status, 400);
});

test("enrich verify route 调用 enrich_and_verify_case RPC", async () => {
  const response = await buildEnrichAndVerifyKnowledgeCaseResponse(
    "case-1",
    {
      hook_text: "三句话讲清今天为什么不能追高",
      admin_insight: "真正起量的是冲突起手，不是后面的板块解释。",
      taxonomy: {
        emotion: ["风险焦虑"],
        scenario: ["开盘复盘"],
        product_category: ["投顾服务"],
      },
    },
    {
      requireCaseLibraryServiceClient: async () => ({
        actor: { userId: "admin-1" },
        supabase: {
          rpc: async (name: string, params: Record<string, unknown>) => {
            assert.equal(name, "enrich_and_verify_case");
            assert.equal(params.p_case_id, "case-1");
            assert.equal(params.p_actor_id, "admin-1");
            return { data: { id: "case-1", status: "verified" }, error: null };
          },
        },
      }) as never,
      unwrapCaseLibraryRpc: unwrapSuccessfulRpc,
    },
  );

  assert.equal(response!.status, 200);
  assert.equal((await response!.json()).item.status, "verified");
});

test("request supplement route 缺少 reason 时返回 400", async () => {
  const response = await buildRequestKnowledgeCaseSupplementResponse("case-1", {});

  assert.equal(response!.status, 400);
});

test("request supplement route 调用 request_case_supplement RPC", async () => {
  const response = await buildRequestKnowledgeCaseSupplementResponse(
    "case-1",
    {
      reason: "缺少真实截图和使用后数据，请补齐。",
      missing_fields: ["screenshot", "usage_metrics"],
    },
    {
      requireCaseLibraryServiceClient: async () => ({
        actor: { userId: "admin-1" },
        supabase: {
          rpc: async (name: string, params: Record<string, unknown>) => {
            assert.equal(name, "request_case_supplement");
            assert.equal(params.p_case_id, "case-1");
            assert.deepEqual(params.p_missing_fields, ["screenshot", "usage_metrics"]);
            return { data: { id: "case-1", status: "needs_revision" }, error: null };
          },
        },
      }) as never,
      unwrapCaseLibraryRpc: unwrapSuccessfulRpc,
    },
  );

  assert.equal(response!.status, 200);
  assert.equal((await response!.json()).item.status, "needs_revision");
});
