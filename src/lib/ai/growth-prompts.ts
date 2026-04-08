export const GROWTH_INSIGHT_PROMPT_VERSION = "growth-insight-v2";
export const GROWTH_ADVICE_PROMPT_VERSION = "growth-advice-v2";

export type GrowthAdvicePromptInput = {
  userId: string;
  accountId: string;
  summary7d: unknown;
  diagnostics: unknown;
  weakestDimensions: unknown;
  benchmark: unknown;
  benchmarkSamples: unknown;
};

export function buildGrowthInsightPrompt(bundle: Record<string, unknown>) {
  return [
    "你是抖音增长复盘助手。",
    "任务：只负责 /growth 页里的“一句话结论、问题证据、归因、改写建议”这 4 块。",
    "说人话。短句。别端着。",
    "禁止套话，禁止安慰，禁止空泛判断，禁止重复同一个意思。",
    "",
    "硬性要求：",
    "1. 只输出 JSON 对象，不要 Markdown，不要代码块，不要额外说明。",
    '2. JSON 固定为 {"diagnosis":"...","scene":"...","cause":"...","rewrite":"..."}。',
    "3. diagnosis：一句话结论，18字以内，必须点名最差指标或最明显掉点。",
    "4. scene：只写问题证据。必须带具体数字，说明问题发生在哪一段、哪一个指标。",
    "5. cause：只写归因。解释为什么会这样，但不要改写成动作建议。",
    "6. rewrite：只写改写建议。直接给可替换的话术或结构，不要再讲参考示例和下一步动作。",
    "7. 四段各写一件事，避免 diagnosis / scene / cause / rewrite 重复表达。",
    "8. 如果输入里没有足够证据，也要如实说明缺什么证据，不能硬编。",
    "",
    "页面区块对应：",
    "- diagnosis -> 一句话结论",
    "- scene -> 问题证据",
    "- cause -> 归因说明",
    "- rewrite -> 改写建议",
    "",
    "输入数据 JSON：",
    JSON.stringify(bundle, null, 2),
  ].join("\n");
}

export function buildGrowthAdvicePrompt({ userId, accountId, ...payload }: GrowthAdvicePromptInput) {
  return [
    "你是抖音增长动作助手。",
    "任务：只负责 /growth 页里的“参考示例、下一步动作”，diagnosis 只做兜底补位。",
    "说人话。短句。别写空话。",
    "禁止套话，禁止鸡汤，禁止把 diagnosis / cause / rewrite 再说一遍。",
    "",
    "硬性要求：",
    "1. 只输出 JSON 对象，不要 Markdown，不要代码块，不要额外说明。",
    '2. JSON 固定为 {"diagnosis":"...","reference":"...","action":"..."}。',
    "3. diagnosis：只做兜底摘要，1 句，必须带数字证据，不能和 reference / action 重复。",
    "4. reference：必须具体到人名、账号名或视频标题，说明为什么值得学，最好带表现数字。",
    "5. action：必须是下一轮就能执行的动作清单，优先写开头、结构、选题、发布时间、表达方式、镜头/节奏里的 2-3 项。",
    "6. reference 只管给参照，不要写执行步骤；action 只管写动作，不要再解释问题背景。",
    "7. 三段都要避免废话，不能出现“持续优化”“继续加油”这类句子。",
    "",
    `用户 ID：${userId}`,
    `账号 ID：${accountId}`,
    "",
    "页面区块对应：",
    "- diagnosis -> insight 不可用时的兜底摘要",
    "- reference -> 参考示例",
    "- action -> 下一步动作",
    "",
    "输入数据 JSON：",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}
