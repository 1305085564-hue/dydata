
// 剩余预算低于此值就不再开新的渠道尝试，避免最后一个渠道刚起步就被掐断
export const MIN_CHANNEL_ATTEMPT_BUDGET_MS = 2_000;

/** 单次渠道尝试的实际超时＝渠道超时与整链剩余预算的较小值（非负） */
export function resolveAttemptBudgetMs(perChannelTimeoutMs: number, remainingBudgetMs: number): number {
  return Math.max(0, Math.min(perChannelTimeoutMs, remainingBudgetMs));
}

export function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  // Some providers/proxies use 403 for edge blocks (for example Cloudflare
  // 1010). Let the failover chain try the next configured channel; auth and
  // quota 403 responses are filtered by isNonRetryableProviderError below.
  if (status === 403) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

export function isNonRetryableProviderError(status: number, body: string): boolean {
  if (status === 401 || status === 402) return true;
  return /insufficient[_ -]?user[_ -]?quota|insufficient[_ -]?quota|余额|额度|欠费|billing|unauthori[sz]ed|forbidden/i.test(body);
}

/**
 * 正文契约校验：上游以 200 返回后判断这次回答算不算数。
 * 不符合契约时抛出可重试的渠道错误——由 sendWithFailover 记一次渠道失败并顺位下一个渠道，
 * 而不是把这段正文当成结果交给业务层。
 */
export function assertContentContract(
  content: string,
  validateContent?: (content: string) => boolean,
): void {
  if (!validateContent) return;
  if (validateContent(content)) return;
  throw new AiChannelError(
    `AI 返回内容不符合输出契约（疑似该渠道不支持本次请求类型）｜raw=${content.replace(/\s+/g, " ").slice(0, 200)}`,
    "content_contract_violation",
    true,
  );
}

export class AiChannelError extends Error {
  constructor(
    message: string,
    public readonly errorType: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiChannelError";
  }
}
