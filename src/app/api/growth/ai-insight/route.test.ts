import test from "node:test";
import assert from "node:assert/strict";

import { canReuseGrowthInsightCache } from "./route";

test("旧版本 success 缓存不复用", () => {
  const cached = canReuseGrowthInsightCache({
    prompt_version: "growth-daily-v1",
    result_json: {
      diagnosis: "开头留人偏弱",
      scene: "2秒跳出率 38%",
      cause: "第一句太慢",
      rewrite: "先说结果再讲过程",
    },
  });

  assert.equal(cached, null);
});

test("当前版本 success 缓存才复用", () => {
  const cached = canReuseGrowthInsightCache({
    prompt_version: "growth-insight-v2",
    result_json: {
      diagnosis: "开头留人偏弱",
      scene: "2秒跳出率 38%",
      cause: "第一句太慢",
      rewrite: "先说结果再讲过程",
    },
  });

  assert.deepEqual(cached, {
    diagnosis: "开头留人偏弱",
    scene: "2秒跳出率 38%",
    cause: "第一句太慢",
    rewrite: "先说结果再讲过程",
  });
});
