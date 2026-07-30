type SupabaseErrorLike = {
  message?: string;
} | null | undefined;

export class SupabaseQueryFailure extends Error {
  readonly publicMessage: string;

  constructor(publicMessage: string, cause: unknown) {
    super(publicMessage, { cause });
    this.name = "SupabaseQueryFailure";
    this.publicMessage = publicMessage;
  }
}

/**
 * ⚠ 仅用于数据库查询错误（result.error）。
 * auth 错误（token 过期等）不应使用此函数，应按未登录降级：if (authError || !user) return null
 */
export function assertSupabaseQuerySucceeded(
  error: SupabaseErrorLike,
  context: string,
): asserts error is null | undefined {
  if (!error) return;
  throw new SupabaseQueryFailure(context, error);
}
