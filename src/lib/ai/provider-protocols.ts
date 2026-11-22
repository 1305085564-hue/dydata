import { toCanonicalModelId } from "@/lib/ai-config/canonical-model";

export type AiProviderProtocol = "openai_compatible" | "cloudflare_clairic";
export type AiModelScope = "general" | "ocr_only";

export const CLAIRIC_CANONICAL_MODEL_ID = "clairic";
export const CLAIRIC_UPSTREAM_MODEL_ID = "@cf/cloudflare/clairic";

export function parseProviderProtocol(value: unknown): AiProviderProtocol | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "openai_compatible" || trimmed === "cloudflare_clairic") {
    return trimmed;
  }
  return null;
}

export function normalizeProviderProtocol(value: unknown): AiProviderProtocol {
  return parseProviderProtocol(value) ?? "openai_compatible";
}

export function getProviderProtocolLabel(protocol: AiProviderProtocol): string {
  return protocol === "cloudflare_clairic"
    ? "Cloudflare Clairic (截图专项)"
    : "标准对话接口 (OpenAI 兼容)";
}

export function normalizeProtocolBaseUrl(
  protocol: AiProviderProtocol,
  rawUrl: unknown,
): string {
  const input = typeof rawUrl === "string" ? rawUrl.trim() : "";
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("渠道地址须为合法的 HTTP/HTTPS 地址");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("渠道地址须为 HTTP/HTTPS 地址，不能带钥匙、查询参数或片段");
  }
  let normalized = url.href.replace(/\/+$/, "");
  if (protocol === "cloudflare_clairic") {
    normalized = normalized
      .replace(/(?:\/@cf\/cloudflare\/clairic)+$/i, "")
      .replace(/\/+$/, "");
  }
  return normalized;
}

export function resolveClairicEndpoint(
  baseUrl: string,
  modelId?: string | null,
): string {
  const cleanBase = normalizeProtocolBaseUrl("cloudflare_clairic", baseUrl);
  const rawModel = typeof modelId === "string" ? modelId.trim().replace(/^\/+/, "") : "";
  const upstreamModel =
    !rawModel || rawModel.toLowerCase() === CLAIRIC_CANONICAL_MODEL_ID
      ? CLAIRIC_UPSTREAM_MODEL_ID
      : rawModel;
  return `${cleanBase}/${upstreamModel}`;
}

export function getModelScope(modelId: string | null | undefined): AiModelScope {
  const trimmed = typeof modelId === "string" ? modelId.trim() : "";
  if (!trimmed) return "general";
  const canonical = toCanonicalModelId(trimmed).toLowerCase();
  return canonical === CLAIRIC_CANONICAL_MODEL_ID ? "ocr_only" : "general";
}

export function isModelAllowedForFeature(
  featureKey: string,
  modelId: string | null | undefined,
): { allowed: true } | { allowed: false; reason: string } {
  const trimmed = typeof modelId === "string" ? modelId.trim() : "";
  if (!trimmed) return { allowed: true };
  if (getModelScope(trimmed) !== "ocr_only") {
    return { allowed: true };
  }
  if (featureKey === "ocr_screenshot") {
    return { allowed: true };
  }
  if (featureKey === "default") {
    return {
      allowed: false,
      reason: "Cloudflare Clairic 是截图专项模型，不能用作全局默认",
    };
  }
  return {
    allowed: false,
    reason: "Cloudflare Clairic 是截图专项模型，仅支持「截图识别」功能，不支持对话或其他业务场景",
  };
}
