// 预设的人类友好显示名称映射
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
  "claude-3.5-sonnet": "Claude 3.5 Sonnet",
  "claude-5-sonnet": "Claude 5 Sonnet",
  "claude-5-opus": "Claude 5 Opus",
  "deepseek-chat": "DeepSeek-V3",
  "deepseek-v3": "DeepSeek-V3",
  "deepseek-reasoner": "DeepSeek R1",
  "deepseek-r1": "DeepSeek R1",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o-mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1-mini",
  "gpt-4.1-nano": "GPT-4.1-nano",
  "gpt-5": "GPT-5",
  "gpt-5-mini": "GPT-5-mini",
  "gpt-5-nano": "GPT-5-nano",
  "chatgpt-4o-latest": "ChatGPT-4o",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "o3-mini": "OpenAI o3-mini",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "qwen-3.8-max": "通义千问 3.8-Max",
  "kimi-k1.5": "Kimi K1.5",
};

export function getModelDisplayName(modelId: string): string {
  if (MODEL_DISPLAY_NAMES[modelId]) return MODEL_DISPLAY_NAMES[modelId];
  // 智能推断
  const id = modelId.toLowerCase();
  if (id.includes("claude-3-5-sonnet") || id.includes("claude-3.5-sonnet")) return "Claude 3.5 Sonnet";
  if (id.includes("claude-5-sonnet")) return "Claude 5 Sonnet";
  if (id.includes("deepseek-chat") || id.includes("deepseek-v3")) return "DeepSeek-V3";
  if (id.includes("deepseek-reasoner") || id.includes("deepseek-r1")) return "DeepSeek R1";
  if (id.includes("gpt-4o-mini")) return "GPT-4o-mini";
  if (id.includes("gpt-4o")) return "GPT-4o";
  if (id.includes("gpt-4.1-mini")) return "GPT-4.1-mini";
  if (id.includes("gpt-4.1-nano")) return "GPT-4.1-nano";
  if (id.includes("gpt-4.1")) return "GPT-4.1";
  if (id.includes("gpt-5-mini")) return "GPT-5-mini";
  if (id.includes("gpt-5-nano")) return "GPT-5-nano";
  if (id.includes("gpt-5")) return "GPT-5";
  if (id.includes("gemini-3.6-flash")) return "Gemini 3.6 Flash";
  if (id.includes("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  return modelId
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}
