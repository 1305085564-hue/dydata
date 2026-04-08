import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGrowthAdvicePrompt,
  buildGrowthInsightPrompt,
  GROWTH_ADVICE_PROMPT_VERSION,
  GROWTH_INSIGHT_PROMPT_VERSION,
} from "./growth-prompts";

test("growth insight prompt 写死 JSON 输出、数字证据和职责边界", () => {
  const prompt = buildGrowthInsightPrompt({
    metrics: { play_count: 12345, completion_rate_5s: "28%", completion_rate: "11%" },
    script_raw_text: "原始文案",
  });

  assert.equal(GROWTH_INSIGHT_PROMPT_VERSION, "growth-insight-v2");
  assert.match(prompt, /只输出 JSON 对象/);
  assert.match(prompt, /"diagnosis":"\.\.\.","scene":"\.\.\.","cause":"\.\.\.","rewrite":"\.\.\."/);
  assert.match(prompt, /scene：只写问题证据。必须带具体数字/);
  assert.match(prompt, /禁止套话/);
  assert.match(prompt, /不要再讲参考示例和下一步动作/);
  assert.match(prompt, /- diagnosis -> 一句话结论/);
  assert.match(prompt, /- rewrite -> 改写建议/);
});

test("growth advice prompt 写死 JSON 输出、禁废话和分工边界", () => {
  const prompt = buildGrowthAdvicePrompt({
    userId: "user-1",
    accountId: "account-1",
    summary7d: { avgPlay: 9800, followerGain: 22 },
    diagnostics: [{ dimension: "开头留人", percentile: 22 }],
    weakestDimensions: ["开头留人"],
    benchmark: { accountName: "对标账号A" },
    benchmarkSamples: [{ title: "3天涨粉1000" }],
  });

  assert.equal(GROWTH_ADVICE_PROMPT_VERSION, "growth-advice-v2");
  assert.match(prompt, /只输出 JSON 对象/);
  assert.match(prompt, /"diagnosis":"\.\.\.","reference":"\.\.\.","action":"\.\.\."/);
  assert.match(prompt, /diagnosis：只做兜底摘要/);
  assert.match(prompt, /reference：必须具体到人名、账号名或视频标题/);
  assert.match(prompt, /action：必须是下一轮就能执行的动作清单/);
  assert.match(prompt, /不能出现“持续优化”“继续加油”/);
  assert.match(prompt, /禁止把 diagnosis \/ cause \/ rewrite 再说一遍/);
  assert.match(prompt, /- reference -> 参考示例/);
  assert.match(prompt, /- action -> 下一步动作/);
});
