// 维护测试专用数据库边界：执行筛选与写入，不替代被测业务函数。
export type TestRow = Record<string, unknown>;
export function memoryDatabase(seed: Record<string, TestRow[]>, options: {
  failTable?: string; failOperation?: string; error?: { code?: string; message: string };
} = {}) {
  const tables = structuredClone(seed);
  const calls: Array<{ table: string; operation: string; payload: TestRow | TestRow[] | null }> = [];
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  let nextId = 1;
  const db = {
    tables, calls, reads,
    auth: { getUser: async () => ({ data: { user: { id: "member-1" } }, error: null }) },
    from(table: string) {
      const filters: Array<(row: TestRow) => boolean> = [];
      const filterValues: Array<[string, unknown]> = [];
      let operation = "select";
      let payload: TestRow | TestRow[] | null = null;
      let single = false;
      let offset = 0;
      let limit = Infinity;
      const orders: Array<{ key: string; ascending: boolean }> = [];
      const execute = () => {
        if (operation === "select") reads.push({ table, filters: [...filterValues] });
        else calls.push({ table, operation, payload: structuredClone(payload) });
        if (options.failTable === table && (!options.failOperation || options.failOperation === operation)) {
          return { data: null, error: options.error ?? { message: "synthetic database failure" } };
        }
        const rows = tables[table] ?? (tables[table] = []);
        let selected = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation === "insert" || operation === "upsert") {
          selected = (Array.isArray(payload) ? payload : [payload ?? {}]).map((row) => ({ id: `${table}-${nextId++}`, ...row }));
          rows.push(...selected);
        } else if (operation === "update") {
          for (const row of selected) Object.assign(row, payload);
        } else if (operation === "delete") {
          tables[table] = rows.filter((row) => !selected.includes(row));
        }
        selected = [...selected].sort((a, b) => {
          for (const order of orders) {
            const compared = String(a[order.key] ?? "").localeCompare(String(b[order.key] ?? ""));
            if (compared) return order.ascending ? compared : -compared;
          }
          return 0;
        }).slice(offset, offset + limit);
        return { data: structuredClone(single ? selected[0] ?? null : selected), error: null, count: selected.length };
      };
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filterValues.push([key, value]); filters.push((row) => row[key] === value); return query; },
        neq(key: string, value: unknown) { filters.push((row) => row[key] !== value); return query; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
        is(key: string, value: unknown) { filters.push((row) => (row[key] ?? null) === value); return query; },
        lt(key: string, value: string) { filters.push((row) => String(row[key]) < value); return query; },
        lte(key: string, value: string) { filters.push((row) => String(row[key]) <= value); return query; },
        gte(key: string, value: string) { filters.push((row) => String(row[key]) >= value); return query; },
        order(key: string, options?: { ascending?: boolean }) { orders.push({ key, ascending: options?.ascending !== false }); return query; },
        range(from: number, to: number) { offset = from; limit = to - from + 1; return query; },
        limit(value: number) { limit = value; return query; },
        abortSignal() { return query; },
        insert(value: TestRow | TestRow[]) { operation = "insert"; payload = value; return query; },
        upsert(value: TestRow | TestRow[]) { operation = "upsert"; payload = value; return query; },
        update(value: TestRow) { operation = "update"; payload = value; return query; },
        delete() { operation = "delete"; return query; },
        single() { single = true; return query; },
        maybeSingle() { single = true; return query; },
        then<TResult1 = ReturnType<typeof execute>, TResult2 = never>(
          resolve?: ((value: ReturnType<typeof execute>) => TResult1 | PromiseLike<TResult1>) | null,
          reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) { return Promise.resolve(execute()).then(resolve, reject); },
      };
      return query;
    },
  };
  return db;
}

export function abnormalSubmission(overrides: TestRow = {}) {
  return {
    mode: "abnormal", anomaly_status: "abnormal", account_id: "account-1", content: "异常作品说明",
    biz_date: "2026-11-28", assets: [],
    metrics: { play_count: 100, likes: 10, comments: 2, shares: 1, favorites: 3, follower_gain: 4, follower_loss: 0, follower_convert: 0, avg_play_duration: 12, bounce_rate_2s: 20, completion_rate_5s: 30, completion_rate: 40 },
    ...overrides,
  };
}

export function submissionDatabase() {
  return memoryDatabase({
    profiles: [{ id: "member-1", name: "成员", team_id: "team-1", membership_status: "active" }],
    accounts: [{ id: "account-1", profile_id: "member-1", name: "账号" }],
    videos: [], daily_reports: [], video_metrics_snapshots: [], video_tags: [],
  });
}
