import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildTopicHubHeadline } from "./topic-hub-headline";

test("选题库标题即答案：跟着视图与筛选变，取数中不编数字", () => {
  const base = { loading: false, totalCount: 128, view: "all" as const, filtered: false };
  assert.equal(buildTopicHubHeadline(base), "128 条干货选题");
  assert.equal(buildTopicHubHeadline({ ...base, filtered: true, totalCount: 6 }), "找到 6 条选题");
  assert.equal(buildTopicHubHeadline({ ...base, view: "my_created", totalCount: 3 }), "我建了 3 条选题");
  assert.equal(buildTopicHubHeadline({ ...base, view: "my_claims", totalCount: 0 }), "我还没认领选题");
  assert.equal(buildTopicHubHeadline({ ...base, loading: true }), null);
});

test("选题库：没有导语，「全部选题」分段不再重复总数", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  assert.doesNotMatch(read("src/components/topics-v2/TopicHubV2.tsx"), /Epigraph|title="选题库"/);
  assert.doesNotMatch(read("src/components/topics-v2/pool/PoolToolbar.tsx"), /\{totalCount\}/);
});
