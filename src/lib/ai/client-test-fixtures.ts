export type Row = Record<string, unknown>;
export type FakeDb = Record<string, Row[]>;

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  maybeSingle() {
    return this.then((result) => ({ data: result.data ? [result.data].flat()[0] ?? null : null, error: null }));
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const rows = (this.db[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }
}

export function createFakeService(db: FakeDb) {
  return {
    from(table: string) {
      return new FakeQuery(db, table);
    },
  };
}

export function makePkmRow(opts: {
  id: string;
  modelId: string;
  keyPriority: number;
  keyName: string;
  providerPriority?: number;
  modelName?: string;
  sortOrder?: number;
}) {
  return {
    id: opts.id,
    model_id: opts.modelId,
    is_enabled: true,
    sort_order: opts.sortOrder ?? 0,
    key: [
      {
        id: opts.keyName,
        api_key: "sk-test",
        is_enabled: true,
        priority: opts.keyPriority,
        consecutive_failures: 0,
        unhealthy_until: null,
        provider: [
          {
            id: "prov-1",
            name: opts.modelName ?? "测试供应商",
            base_url: "https://example.com",
            priority: opts.providerPriority ?? 1,
            is_enabled: true,
          },
        ],
      },
    ],
  };
}
