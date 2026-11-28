import { readQueryPages, type PagedQueryOptions } from "./paged-query";
export { SUPABASE_DEFAULT_PAGE_SIZE } from "./paged-query";
// 实际连接腾讯云 CloudBase，目录名是历史遗留。
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
  options?: PagedQueryOptions,
): Promise<T[]> {
  const result = await readQueryPages(runPage, options);
  return requireQueryRows(result, context);
}
