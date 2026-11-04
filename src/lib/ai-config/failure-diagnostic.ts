import { sanitizeProviderErrorMessage } from "@/lib/ai/provider-health";

export type ChannelFailureDiagnostic = {
  category: "provider" | "model_access" | "credentials" | "quota" | "unknown";
  owner: "provider" | "configuration" | "unknown";
  technical: { message: string; status: number | null; requestId: string | null };
};

/** Structured facts only; the administrator-facing wording belongs to the view. */
export function describeChannelFailure(input: { message: string; status?: number; requestId?: string | null; secrets?: string[] }): ChannelFailureDiagnostic {
  const message = sanitizeProviderErrorMessage(input.message, input.secrets);
  const status = input.status ?? (Number(message.match(/(?:HTTP|http_|请求失败:)\s*(\d{3})/i)?.[1]) || null);
  let category: ChannelFailureDiagnostic["category"] = "unknown";
  if (/model.*(?:not.?found|unsupported|not.?available|not.?enabled|not.?allowed)|(?:unsupported|invalid|unknown)[_\s-]?model|no such model|模型.*(?:不存在|未开通|无权)/i.test(message)) category = "model_access";
  else if (status === 401 || /invalid.*(?:key|credential)|unauthorized/i.test(message)) category = "credentials";
  else if (status === 402 || /quota|billing|余额|额度|欠费/i.test(message)) category = "quota";
  else if ((status !== null && status >= 500) || /timeout|超时|network|网络|Cloudflare|captcha|access denied/i.test(message)) category = "provider";
  return {
    category,
    owner: category === "provider" || category === "model_access" ? "provider" : category === "unknown" ? "unknown" : "configuration",
    technical: { message, status, requestId: input.requestId ? sanitizeProviderErrorMessage(input.requestId, input.secrets) : null },
  };
}
