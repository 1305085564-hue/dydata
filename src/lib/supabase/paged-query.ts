import { withTimeout } from "@/lib/timeout";

export const SUPABASE_DEFAULT_PAGE_SIZE = 1000;

type PageResult<T, E> = { data: T[] | null; error: E | null };
export type PagedQueryOptions = { pageSize?: number; maxPages?: number; timeoutMs?: number };

/** 全量读取必须按唯一键稳定排序；每页重新创建查询，避免 SDK builder 状态串页。
 * 数据库错误保留给调用方处理；达到安全上限、无效响应或超时直接失败，绝不交付半份数据。
 */
export async function readQueryPages<T, E>(
  runPage: (from: number, to: number, signal: AbortSignal) => PromiseLike<PageResult<T, E>>,
  options: PagedQueryOptions = {},
): Promise<PageResult<T, E>> {
  const pageSize = options.pageSize ?? SUPABASE_DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? 100;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > SUPABASE_DEFAULT_PAGE_SIZE) {
    throw new Error("pageSize 必须是 1–1000 的整数");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error("maxPages 必须是正整数");
  return withTimeout(async (signal) => {
    const rows: T[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      signal.throwIfAborted();
      const from = page * pageSize;
      const result = await runPage(from, from + pageSize - 1, signal);
      if (result.error) return { data: null, error: result.error };
      if (!Array.isArray(result.data)) throw new Error("分页查询返回无效数据");
      rows.push(...result.data);
      if (result.data.length < pageSize) return { data: rows, error: null };
    }
    throw new Error(`分页查询超过安全读取上限（${maxPages} 页），请缩小查询范围`);
  }, { timeoutMs: options.timeoutMs ?? 20_000, operation: "database.paged-query" });
}
