function displayToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === "gpt") return "GPT";
  if (lower === "llm") return "LLM";
  if (lower === "api") return "API";
  if (lower === "ocr") return "OCR";
  if (lower === "ai") return "AI";
  if (lower === "deepseek") return "DeepSeek";
  if (lower === "chatgpt") return "ChatGPT";
  if (/^v\d+(?:\.\d+)?$/i.test(token)) return token.toUpperCase();
  if (/^\d+(?:\.\d+)?[bkm]$/i.test(token)) return token.replace(/[bkm]$/i, (letter) => letter.toUpperCase());
  if (/^[o]\d+(?:-[a-z0-9]+)*$/i.test(token)) return token.toLowerCase();
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function collapseNumericVersionParts(tokens: string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if (/^\d$/.test(current) && /^\d$/.test(next ?? "")) {
      result.push(`${current}.${next}`);
      index += 1;
    } else {
      result.push(current);
    }
  }
  return result;
}

/** Display names are derived from the model ID; variants keep their own suffix. */
export function getModelDisplayName(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return "未知模型";
  const namespacedId = trimmed.split("/").pop() || trimmed;
  const dateMatch = namespacedId.match(/[-_](\d{8}|\d{6})$/);
  const dateSuffix = dateMatch?.[1]
    ? dateMatch[1].length === 8
      ? ` (${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)})`
      : ` (${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)})`
    : "";
  const withoutDate = dateMatch ? namespacedId.slice(0, -dateMatch[0].length) : namespacedId;
  const rawTokens = withoutDate.split(/[-_]+/).filter(Boolean).map((token) => token.toLowerCase());
  let variantSuffix = "";
  const last = rawTokens.at(-1);
  if (last === "thinking" || last === "agentic") {
    rawTokens.pop();
    variantSuffix = ` (${last === "thinking" ? "Thinking" : "Agentic"})`;
  }
  const tokens = collapseNumericVersionParts(rawTokens);
  const words = tokens.map(displayToken);
  if (words.length === 0) return "未知模型";

  let name: string;
  if (tokens[0] === "claude" && ["haiku", "sonnet", "opus"].includes(tokens[1] ?? "")) {
    name = `Claude ${words.slice(1).join(" ")}`;
  } else if (tokens[0] === "gpt") {
    const suffix = tokens[2] === "mini" || tokens[2] === "nano"
      ? `-${tokens[2]}${words.length > 3 ? ` ${words.slice(3).join(" ")}` : ""}`
      : words.length > 2 ? ` ${words.slice(2).join(" ")}` : "";
    name = `GPT-${words[1] ?? ""}${suffix}`.trim();
  } else if (/^o\d/i.test(tokens[0])) {
    name = `OpenAI ${words[0]}${tokens[1] === "mini" || tokens[1] === "nano" ? `-${tokens[1]}` : words.length > 1 ? ` ${words.slice(1).join(" ")}` : ""}`;
  } else {
    name = words.join(" ");
  }
  return `${name}${variantSuffix}${dateSuffix}`;
}

/** Only a raw ID is safe for runtime backfill; old generated labels are handled by a one-time migration. */
export function canBackfillRawModelDisplayName(displayName: string | null | undefined, modelId: string): boolean {
  const stored = (displayName ?? "").trim();
  return stored === modelId;
}

/**
 * 解析模型展示名：库里已经存了可读名就直接用。
 * 禁止把可读名再喂回 getModelDisplayName —— 那会被家族规则折叠
 * （例如「GPT-5.6 Sol」会被 gpt-5 兜底规则折叠成「GPT-5」，同渠道的 GPT-5 变体就分不清了）。
 */
export function resolveModelDisplayName(
  displayName?: string | null,
  modelId?: string | null,
): string {
  const stored = (displayName ?? "").trim();
  const id = (modelId ?? "").trim();
  if (stored && stored !== id) return stored;
  return getModelDisplayName(id || stored);
}
