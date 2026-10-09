// 预设的人类友好显示名称映射
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
  "claude-3.5-sonnet": "Claude 3.5 Sonnet",
  "claude-haiku-4-5-20251001": "Claude 4.5 Haiku",
  "claude-haiku-4-5": "Claude 4.5 Haiku",
  "claude-sonnet-4-5": "Claude 4.5 Sonnet",
  "claude-opus-4-5": "Claude 4.5 Opus",
  "claude-5-sonnet": "Claude 5 Sonnet",
  "claude-5-opus": "Claude 5 Opus",
  "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
  "claude-3.5-haiku": "Claude 3.5 Haiku",
  "claude-3-haiku-20240307": "Claude 3 Haiku",
  "claude-3-opus-20240229": "Claude 3 Opus",
  "claude-3-sonnet-20240229": "Claude 3 Sonnet",
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
  "gpt-6-luna": "GPT-6 Luna",
  "gpt-6-sol": "GPT-6 Sol",
  "o3-mini": "OpenAI o3-mini",
  "o1-mini": "OpenAI o1-mini",
  "o1-preview": "OpenAI o1-preview",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-1.5-pro": "Gemini 1.5 Pro",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
  "qwen-3.8-max": "通义千问 3.8-Max",
  "kimi-k1.5": "Kimi K1.5",
};

function formatFallbackName(rawId: string): string {
  // 去除前缀命名空间 (如 provider/...)
  const nameWithoutPrefix = rawId.includes("/") ? rawId.split("/").pop() || rawId : rawId;
  // 去除尾部形如 -20251001 的日期标记
  const withoutDate = nameWithoutPrefix.replace(/[-_]\d{8}$/, "").replace(/[-_]\d{6}$/, "");
  // 拆分成单词
  const words = withoutDate.split(/[-_]+/).filter(Boolean);
  if (words.length === 0) return "自定义模型";

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      // 常见缩写统一大写
      if (/^(gpt|llm|api|ocr|r1|v[0-9]+|[0-9]+[bkm])$/i.test(word)) {
        return word.toUpperCase();
      }
      if (lower === "ai") return "AI";
      if (lower === "chatgpt") return "ChatGPT";
      if (lower === "deepseek") return "DeepSeek";
      // 首字母大写
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function getModelDisplayName(modelId: string): string {
  if (!modelId) return "未知模型";
  if (MODEL_DISPLAY_NAMES[modelId]) return MODEL_DISPLAY_NAMES[modelId];

  // 1. 去除供应商命名空间前缀，如 "anthropic/claude-..."
  const trimmed = modelId.trim();
  const cleanId = trimmed.includes("/") ? trimmed.split("/").pop() || trimmed : trimmed;
  if (MODEL_DISPLAY_NAMES[cleanId]) return MODEL_DISPLAY_NAMES[cleanId];

  const id = cleanId.toLowerCase();

  // 2. 智能推断 Claude 系列
  if (id.includes("claude-haiku-4-5") || id.includes("claude-4-5-haiku") || id.includes("claude-4.5-haiku")) return "Claude 4.5 Haiku";
  if (id.includes("claude-sonnet-4-5") || id.includes("claude-4-5-sonnet") || id.includes("claude-4.5-sonnet")) return "Claude 4.5 Sonnet";
  if (id.includes("claude-opus-4-5") || id.includes("claude-4-5-opus") || id.includes("claude-4.5-opus")) return "Claude 4.5 Opus";
  if (id.includes("claude-3-5-sonnet") || id.includes("claude-3.5-sonnet")) return "Claude 3.5 Sonnet";
  if (id.includes("claude-3-5-haiku") || id.includes("claude-3.5-haiku")) return "Claude 3.5 Haiku";
  if (id.includes("claude-5-sonnet")) return "Claude 5 Sonnet";
  if (id.includes("claude-5-opus")) return "Claude 5 Opus";
  if (id.includes("claude-3-opus")) return "Claude 3 Opus";
  if (id.includes("claude-3-haiku")) return "Claude 3 Haiku";
  if (id.includes("claude-3-sonnet")) return "Claude 3 Sonnet";

  // 3. DeepSeek 系列
  if (id.includes("deepseek-chat") || id.includes("deepseek-v3")) return "DeepSeek-V3";
  if (id.includes("deepseek-reasoner") || id.includes("deepseek-r1")) return "DeepSeek R1";

  // 4. GPT 系列
  if (id.includes("gpt-6-luna")) return "GPT-6 Luna";
  if (id.includes("gpt-6-sol")) return "GPT-6 Sol";
  if (id.includes("gpt-5.6-sol")) return "GPT-5.6 Sol";
  if (id.includes("gpt-4o-mini")) return "GPT-4o-mini";
  if (id.includes("gpt-4o")) return "GPT-4o";
  if (id.includes("gpt-4.1-mini")) return "GPT-4.1-mini";
  if (id.includes("gpt-4.1-nano")) return "GPT-4.1-nano";
  if (id.includes("gpt-4.1")) return "GPT-4.1";
  if (id.includes("gpt-5-mini")) return "GPT-5-mini";
  if (id.includes("gpt-5-nano")) return "GPT-5-nano";
  if (id.includes("gpt-5")) return "GPT-5";
  if (id.includes("chatgpt-4o")) return "ChatGPT-4o";
  if (id.includes("o3-mini")) return "OpenAI o3-mini";
  if (id.includes("o1-mini")) return "OpenAI o1-mini";
  if (id.includes("o1-preview")) return "OpenAI o1-preview";
  if (id.includes("o1")) return "OpenAI o1";

  // 5. Gemini 系列
  if (id.includes("gemini-2.5-flash-lite")) return "Gemini 2.5 Flash Lite";
  if (id.includes("gemini-3.5-flash-lite")) return "Gemini 3.5 Flash Lite";
  if (id.includes("gemini-3.6-flash")) return "Gemini 3.6 Flash";
  if (id.includes("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  if (id.includes("gemini-2.0-flash")) return "Gemini 2.0 Flash";
  if (id.includes("gemini-1.5-pro")) return "Gemini 1.5 Pro";
  if (id.includes("gemini-1.5-flash")) return "Gemini 1.5 Flash";

  // 6. 其他国产与开源系列
  if (id.includes("qwen-3.8-max")) return "通义千问 3.8-Max";
  if (id.includes("kimi-k1.5")) return "Kimi K1.5";

  // 7. 稳定可读兜底：格式化为人类可读标题，绝不直接把内部原始 ID 当标题
  return formatFallbackName(cleanId);
}
