import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

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
