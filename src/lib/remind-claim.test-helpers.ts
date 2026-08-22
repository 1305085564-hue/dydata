/**
 * 测试夹具：模拟 remind_logs 的部分唯一索引
 * （同日同人非豁免 sending/success 合计最多一行）与行锁条件更新。
 * 仅测试使用，禁止引入业务代码。
 */

export type RemindLogRow = {
  id: string;
  target_date: string;
  user_id: string;
  user_name: string;
  status: "sending" | "success" | "failed";
  is_exempted: boolean;
  sent_at: string;
  response_body?: string | null;
};

type RowPayload = Partial<Omit<RemindLogRow, "id">> & { user_id: string };

interface BuilderState {
  op: "select" | "insert" | "update";
  payload: unknown;
  updatePayload: Record<string, unknown> | null;
  eqFilters: Record<string, unknown>;
  inFilter: { col: string; values: unknown[] } | null;
  ltFilter: { col: string; val: unknown } | null;
  orderCol: string | null;
  orderAsc: boolean;
  limitN: number | null;
}

type QueryResult = {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message?: string } | null;
};

export class FakeRemindTable {
  rows: RemindLogRow[] = [];
  private seq = 0;

  insertRow(payload: RowPayload): RemindLogRow {
    const row: RemindLogRow = {
      id: `r${++this.seq}`,
      target_date: payload.target_date ?? "2026-08-23",
      user_id: payload.user_id,
      user_name: payload.user_name ?? "",
      status: payload.status ?? "sending",
      is_exempted: payload.is_exempted ?? false,
      sent_at: payload.sent_at ?? new Date().toISOString(),
      response_body: payload.response_body ?? null,
    };
    this.rows.push(row);
    return row;
  }

  /** 模拟唯一索引：同日同人非豁免的 sending/success 合计最多一行 */
  findActiveClaim(targetDate: string, userId: string): RemindLogRow | undefined {
    return this.rows.find(
      (row) =>
        row.target_date === targetDate &&
        row.user_id === userId &&
        !row.is_exempted &&
        (row.status === "sending" || row.status === "success"),
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeClient(table: FakeRemindTable, opts: { insertErrorCode?: string } = {}): any {
  function matches(row: RemindLogRow, state: BuilderState): boolean {
    for (const [col, val] of Object.entries(state.eqFilters)) {
      if ((row as unknown as Record<string, unknown>)[col] !== val) return false;
    }
    if (
      state.inFilter &&
      !state.inFilter.values.includes((row as unknown as Record<string, unknown>)[state.inFilter.col])
    ) {
      return false;
    }
    if (
      state.ltFilter &&
      String((row as unknown as Record<string, unknown>)[state.ltFilter.col]) >= String(state.ltFilter.val)
    ) {
      return false;
    }
    return true;
  }

  function exec(state: BuilderState): QueryResult {
    if (state.op === "insert") {
      if (opts.insertErrorCode) return { data: null, error: { code: opts.insertErrorCode } };
      const payload = state.payload as RowPayload;
      const status = String(payload.status);
      if (!["sending", "success", "failed"].includes(status)) {
        return { data: null, error: { code: "23514" } };
      }
      if (
        (status === "sending" || status === "success") &&
        payload.is_exempted === false &&
        table.findActiveClaim(String(payload.target_date), String(payload.user_id))
      ) {
        return { data: null, error: { code: "23505" } };
      }
      const row = table.insertRow(payload);
      return { data: [{ id: row.id }], error: null };
    }

    if (state.op === "update") {
      let candidates = table.rows.filter((row) => matches(row, state));
      if (state.limitN != null) candidates = candidates.slice(0, state.limitN);
      for (const row of candidates) {
        Object.assign(row, state.updatePayload ?? {});
      }
      return { data: candidates.map((row) => ({ id: row.id })), error: null };
    }

    // 纯查询（冲突行探测）
    let results = table.rows.filter((row) => matches(row, state));
    if (state.orderCol) {
      results = [...results].sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[state.orderCol as string]);
        const bv = String((b as unknown as Record<string, unknown>)[state.orderCol as string]);
        return state.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (state.limitN != null) results = results.slice(0, state.limitN);
    return { data: results as unknown as Array<Record<string, unknown>>, error: null };
  }

  function makeBuilder(): QueryBuilder {
    const state: BuilderState = {
      op: "select",
      payload: null,
      updatePayload: null,
      eqFilters: {},
      inFilter: null,
      ltFilter: null,
      orderCol: null,
      orderAsc: true,
      limitN: null,
    };
    const builder = {
      insert(payload: unknown): QueryBuilder {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: Record<string, unknown>): QueryBuilder {
        state.op = "update";
        state.updatePayload = payload;
        return builder;
      },
      select(): QueryBuilder {
        return builder;
      },
      eq(col: string, val: unknown): QueryBuilder {
        state.eqFilters[col] = val;
        return builder;
      },
      in(col: string, values: unknown[]): QueryBuilder {
        state.inFilter = { col, values };
        return builder;
      },
      lt(col: string, val: unknown): QueryBuilder {
        state.ltFilter = { col, val };
        return builder;
      },
      order(col: string, options: { ascending?: boolean } = {}): QueryBuilder {
        state.orderCol = col;
        state.orderAsc = options.ascending !== false;
        return builder;
      },
      limit(n: number): QueryBuilder {
        state.limitN = n;
        return builder;
      },
      then(resolve: (value: QueryResult) => void, reject: (reason?: unknown) => void) {
        try {
          resolve(exec(state));
        } catch (error) {
          reject(error);
        }
      },
    };
    return builder;
  }

  interface QueryBuilder {
    insert(payload: unknown): QueryBuilder;
    update(payload: Record<string, unknown>): QueryBuilder;
    select(cols?: string): QueryBuilder;
    eq(col: string, val: unknown): QueryBuilder;
    in(col: string, values: unknown[]): QueryBuilder;
    lt(col: string, val: unknown): QueryBuilder;
    order(col: string, options?: { ascending?: boolean }): QueryBuilder;
    limit(n: number): QueryBuilder;
    then(resolve: (value: QueryResult) => void, reject?: (reason?: unknown) => void): void;
  }

  return {
    from(name: string) {
      if (name !== "remind_logs") throw new Error(`unexpected table: ${name}`);
      return makeBuilder();
    },
  };
}
