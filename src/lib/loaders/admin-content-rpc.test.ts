import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import { parseContentListQuery } from "@/lib/content/domain/content-list-query";
import { queryAdminContentRpcPage } from "./admin-content-rpc";

test("内容列表 RPC 同时接收公司配置的五项留存差线", async () => {
  const rpcCapture: { current: Record<string, unknown> | null } = { current: null };
  const profilesQuery = {
    select: () => profilesQuery,
    in: () => profilesQuery,
    order: () => profilesQuery,
    then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  const supabase = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      rpcCapture.current = args;
      return Promise.resolve({ data: { diagnostics: { evaluationStandardsVersion: 2 } }, error: null });
    },
    from: () => profilesQuery,
  };
  const standards = {
    ...structuredClone(DEFAULT_EVALUATION_STANDARDS),
    bounceRate2s: { good: 22, poor: 44 },
    completionRate5s: { good: 72, poor: 42 },
    avgPlayDuration: { good: 52, poor: 32 },
    avgPlayRatio: { good: 32, poor: 14 },
    completionRate: { good: 12, poor: 4 },
  };

  await queryAdminContentRpcPage({
    supabase: supabase as never,
    query: { ...parseContentListQuery(new URLSearchParams()), perspective: "company", teamId: null },
    scope: { visibleUserIds: ["user-1"] },
    cursor: null,
    evaluationStandards: standards,
  });

  assert.ok(rpcCapture.current);
  const targets = (rpcCapture.current.p_filters as { evaluationTargets: typeof standards }).evaluationTargets;
  assert.deepEqual(targets.bounceRate2s, { good: 22, poor: 44 });
  assert.deepEqual(targets.completionRate5s, { good: 72, poor: 42 });
  assert.deepEqual(targets.avgPlayDuration, { good: 52, poor: 32 });
  assert.deepEqual(targets.avgPlayRatio, { good: 32, poor: 14 });
  assert.deepEqual(targets.completionRate, { good: 12, poor: 4 });
});
