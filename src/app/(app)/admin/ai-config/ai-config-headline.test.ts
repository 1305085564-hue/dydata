import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import type { CallStats } from "@/lib/ai-config/call-stats-contract";
import { buildAiConfigHeadline } from "./ai-config-headline";

test("AI 配置标题即答案：停摆优先，其次顶班，否则全部正常", () => {
  assert.equal(buildAiConfigHeadline({ normal: 6, fallback: 1, outage: 2 }), "2 个功能停摆 · 1 个在顶班");
  assert.equal(buildAiConfigHeadline({ normal: 6, fallback: 0, outage: 1 }), "1 个功能停摆");
  assert.equal(buildAiConfigHeadline({ normal: 6, fallback: 2, outage: 0 }), "2 个功能在顶班，其余正常");
  assert.equal(buildAiConfigHeadline({ normal: 8, fallback: 0, outage: 0 }), "8 个功能都正常");
  assert.equal(buildAiConfigHeadline(null), null);
});

test("AI 配置：没有导语；功能状态只在页头说，算力区那一行只说渠道", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  assert.doesNotMatch(read("src/app/(app)/admin/ai-config/page.tsx"), /Epigraph|title="AI 配置"/);
  assert.doesNotMatch(read("src/app/(app)/admin/ai-config/components/compute-pool-header.tsx"), /个功能正常|个在顶班|个停摆/);
});

function stats(partial: Partial<CallStats>): CallStats {
  return { generatedAt: "2026-11-19T00:00:00Z", channels: [], features: [], recentFailures: [], ...partial };
}
const win = (calls: number, successRate: number | null) => ({ calls, successRate, avgMs: null });

test("AI 配置标题接上调用统计：停摆顶班仍优先，其次渠道近期出错，再说近 3 天整体", () => {
  const ok = { normal: 8, fallback: 0, outage: 0 };
  const failing = stats({
    channels: [{ keyModelId: "k1", modelId: "m", recent1000: win(100, 0.99), recent: win(50, 0.6), lastFailure: null }],
  });
  assert.equal(buildAiConfigHeadline({ normal: 6, fallback: 0, outage: 1 }, failing), "1 个功能停摆");
  assert.equal(buildAiConfigHeadline(ok, failing), "功能都还能用 · 1 条渠道近期在出错");
  assert.equal(buildAiConfigHeadline({ ...ok, needsAttentionChannels: 2 }, stats({})), "功能都正常 · 2 条渠道要你处理");

  const feature = (calls: number, rate: number) => ({
    featureKey: "f", recent1000: { ...win(calls, rate), rescuedCount: 0 }, recent: { ...win(calls, rate), rescuedCount: 0 },
  });
  assert.equal(buildAiConfigHeadline(ok, stats({ features: [feature(400, 1), feature(100, 0.98)] })), "近 3 天调用都正常 · 成功 99.6%");
  assert.equal(buildAiConfigHeadline(ok, stats({ features: [feature(100, 0.95)] })), "近 3 天调用成功 95%");
  // 近 3 天没有调用：回到功能状态，不编数
  assert.equal(buildAiConfigHeadline(ok, stats({ features: [feature(0, 0)] })), "8 个功能都正常");
});
