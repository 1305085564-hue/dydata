import { markProviderKeySuccess } from "./provider-routing";

type ServiceClient = Parameters<typeof markProviderKeySuccess>[0];

export const AI_CALL_ERROR_KINDS = [
  "超时",
  "限流",
  "额度",
  "鉴权",
  "模型不存在",
  "网络",
  "服务端",
  "内容不合格",
  "其他",
] as const;

export type AiCallErrorKind = (typeof AI_CALL_ERROR_KINDS)[number];

/** 将渠道错误统一转换为台账对外展示的故障类型。 */
export function mapAiErrorKind(errorType: string, message = ""): AiCallErrorKind {
  const text = `${errorType} ${message}`.toLowerCase();
  const status = /^http_(\d{3})$/.exec(errorType)?.[1];

  if (errorType === "timeout" || errorType === "http_408" || /timeout|超时/.test(text)) return "超时";
  if (errorType === "http_429" || /rate[_ -]?limit|too many requests|限流/.test(text)) return "限流";
  if (errorType === "http_402" || /quota|billing|余额|额度|欠费/.test(text)) return "额度";
  if (errorType === "http_401" || /unauthori[sz]ed|api[_ -]?key|credential|鉴权/.test(text)) return "鉴权";
  if (errorType === "http_404" || /model[_ -]?(?:not[_ -]?found|unavailable|unsupported|invalid)|unsupported[_ -]?model|模型不存在/.test(text)) return "模型不存在";
  if (errorType === "network" || /network|fetch failed|连接|网络/.test(text)) return "网络";
  if ((status && Number(status) >= 500) || /server error|服务端|上游请求失败/.test(text)) return "服务端";
  if (/content[_ -]?(?:contract|invalid)|empty[_ -]?(?:response|stream)|invalid[_ -]?json|输出契约|内容不合格/.test(text)) return "内容不合格";
  return "其他";
}

export async function recordAiCallAttempt(input: {
  service: ServiceClient | null;
  requestId: string;
  attemptNo: number;
  featureKey: string | null;
  modelId: string;
  keyModelId: string | null;
  keyId: string | null;
  isSuccess: boolean;
  errorKind: AiCallErrorKind | null;
  errorMessage: string | null;
  durationMs: number;
  isProbe: boolean;
}): Promise<void> {
  if (!input.service) return;

  try {
    const query = input.service.from("ai_call_attempts") as unknown as {
      insert?: (values: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
    };
    if (typeof query.insert !== "function") return;
    const { error } = await query.insert({
      request_id: input.requestId,
      attempt_no: input.attemptNo,
      feature_key: input.featureKey,
      model_id: input.modelId,
      key_model_id: input.keyModelId,
      key_id: input.keyId,
      is_success: input.isSuccess,
      error_kind: input.errorKind,
      error_message: input.errorMessage?.slice(0, 200) ?? null,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      is_probe: input.isProbe,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.warn("[ai-client] call attempt log skipped", error);
  }
}
