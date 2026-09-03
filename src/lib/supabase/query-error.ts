type SupabaseErrorLike = {
  message?: string;
} | null | undefined;

export type SupabaseQueryPageResult<T> = {
  data: T[] | null;
  error: SupabaseErrorLike;
};

export type SupabaseMaybeRowResult<T> = {
  data: T | null;
  error: SupabaseErrorLike;
};

export const SUPABASE_DEFAULT_PAGE_SIZE = 1000;

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

export function requireQueryRows<T>(
  result: SupabaseQueryPageResult<T>,
  context: string,
): T[] {
  assertSupabaseQuerySucceeded(result.error, context);
  return result.data ?? [];
}

export function requireMaybeQueryRow<T>(
  result: SupabaseMaybeRowResult<T>,
  context: string,
): T | null {
  assertSupabaseQuerySucceeded(result.error, context);
  return result.data ?? null;
}

/**
 * 按稳定分页把超过 Supabase 默认 1000 行上限的结果全部取回。
 * 调用方必须在 runPage 内使用稳定 `.order()`，再 `.range(from, to)`。
 */
export async function fetchAllQueryPages<T>(
  runPage: (from: number, to: number) => PromiseLike<SupabaseQueryPageResult<T>>,
  context: string,
  options?: { pageSize?: number },
): Promise<T[]> {
  const pageSize = options?.pageSize ?? SUPABASE_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize 必须是正整数");
  }

  const rows: T[] = [];
  let from = 0;
  while (true) {
    const result = await runPage(from, from + pageSize - 1);
    const page = requireQueryRows(result, context);
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
