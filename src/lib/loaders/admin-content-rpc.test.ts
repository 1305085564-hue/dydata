import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import { DEFAULT_RATING_RULE } from "@/lib/breakout-rating";
import { parseContentListQuery } from "@/lib/content/domain/content-list-query";
import { buildEvaluationTargetsPayload, queryAdminContentRpcPage } from "./admin-content-rpc";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  const targets = (rpcCapture.current.p_filters as { evaluationTargets: ReturnType<typeof buildEvaluationTargetsPayload> }).evaluationTargets;
  assert.deepEqual(targets.bounceRate2s, { good: 22, poor: 44 });
  assert.deepEqual(targets.completionRate5s, { good: 72, poor: 42 });
  assert.deepEqual(targets.avgPlayDuration, { good: 52, poor: 32 });
  assert.deepEqual(targets.avgPlayRatio, { good: 32, poor: 14 });
  assert.deepEqual(targets.completionRate, { good: 12, poor: 4 });
  assert.deepEqual(targets.ratingRule, DEFAULT_RATING_RULE);
});

test("评价目标缺省时也带完整评级规则，并锁住所有列表 RPC 调用点", () => {
  const targets = buildEvaluationTargetsPayload();
  assert.deepEqual(targets.ratingRule, DEFAULT_RATING_RULE);
  assert.deepEqual(targets, buildEvaluationTargetsPayload(DEFAULT_EVALUATION_STANDARDS));

  const sourceRoot = join(process.cwd(), "src");
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) files.push(file);
    }
  };
  visit(sourceRoot);
  const rpcFiles = files.filter((file) => readFileSync(file, "utf8").includes('rpc("admin_content_list_page"'));
  assert.ok(rpcFiles.length > 0, "没有找到 admin_content_list_page 调用点，扫描规则失效");
  for (const file of rpcFiles) {
    assert.match(readFileSync(file, "utf8"), /buildEvaluationTargetsPayload/, `列表 RPC 调用未经过 buildEvaluationTargetsPayload：${file}`);
  }
});
