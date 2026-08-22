import assert from "node:assert/strict";
import test from "node:test";

import {
  claimSmartAlerts,
  markSmartAlertClaimsSent,
  releaseSmartAlertClaims,
  type SmartAlertLike,
} from "./smart-alert-claim";

// ── 有状态假表：模拟 smart_alert_claims.dedupe_key 唯一约束 ──

type ClaimRow = {
  id: string;
  dedupe_key: string;
  user_id: string | null;
  target: string;
  payload: Record<string, unknown>;
  status: "claimed" | "sent" | "expired";
  sent_at: string | null;
};

class FakeClaimTable {
  rows: ClaimRow[] = [];
  private seq = 0;

  nextId(): string {
    return `a${++this.seq}`;
  }

  findByKey(dedupeKey: string): ClaimRow | undefined {
    return this.rows.find((row) => row.dedupe_key === dedupeKey);
  }
}

interface ClaimQueryResult {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message?: string } | null;
}

interface ClaimBuilder {
  insert(payload: Record<string, unknown>): ClaimBuilder;
  update(payload: Record<string, unknown>): ClaimBuilder;
  delete(): ClaimBuilder;
  select(cols?: string): ClaimBuilder;
  eq(col: string, val: unknown): ClaimBuilder;
  lt(col: string, val: string): ClaimBuilder;
  in(col: string, values: unknown[]): ClaimBuilder;
  then(resolve: (value: ClaimQueryResult) => void, reject?: (reason?: unknown) => void): void;
}

function makeClaimClient(table: FakeClaimTable, opts: { insertErrorCode?: string; deleteError?: boolean } = {}) {
  interface ClaimState {
    op: "select" | "insert" | "update" | "delete";
    payload: Record<string, unknown> | null;
    updatePayload: Record<string, unknown> | null;
    eqFilters: Record<string, unknown>;
    ltFilters: Record<string, string>;
    inFilter: { col: string; values: unknown[] } | null;
  }
  function makeBuilder(state: ClaimState): ClaimBuilder {
    const builder: ClaimBuilder = {
      insert(payload: Record<string, unknown>) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.op = "update";
        state.updatePayload = payload;
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        state.eqFilters[col] = val;
        return builder;
      },
      lt(col: string, val: string) {
        state.ltFilters[col] = val;
        return builder;
      },
      in(col: string, values: unknown[]) {
        state.inFilter = { col, values };
        return builder;
      },
      then(resolve: (value: ClaimQueryResult) => void) {
        resolve(exec(state));
      },
    };
    return builder;
  }

  function exec(state: ClaimState): ClaimQueryResult {
    const matchesState = (row: ClaimRow) => {
      for (const [col, val] of Object.entries(state.eqFilters)) {
        if ((row as unknown as Record<string, unknown>)[col] !== val) return false;
      }
      for (const [col, val] of Object.entries(state.ltFilters)) {
        const rowValue = (row as unknown as Record<string, unknown>)[col];
        if (typeof rowValue !== "string" || rowValue >= val) return false;
      }
      if (
        state.inFilter &&
        !state.inFilter.values.includes((row as unknown as Record<string, unknown>)[state.inFilter.col])
      ) {
        return false;
      }
      return true;
    };

    if (state.op === "insert") {
      if (opts.insertErrorCode) return { data: null, error: { code: opts.insertErrorCode } };
      const key = typeof state.payload?.dedupe_key === "string" ? state.payload.dedupe_key : null;
      const existing = key ? table.findByKey(key) : undefined;
      if (existing && existing.status !== "expired") {
        return { data: null, error: { code: "23505" } };
      }
      const row: ClaimRow = {
        id: table.nextId(),
        dedupe_key: key ?? "",
        user_id: typeof state.payload?.user_id === "string" ? state.payload.user_id : null,
        target: typeof state.payload?.target === "string" ? state.payload.target : "",
        payload: (state.payload?.payload ?? {}) as Record<string, unknown>,
        status: "claimed",
        sent_at: null,
      };
      table.rows.push(row);
      return { data: [{ id: row.id }], error: null };
    }

    if (state.op === "update") {
      const candidates = table.rows.filter(matchesState);
      for (const row of candidates) Object.assign(row, state.updatePayload);
      return { data: candidates.map((row) => ({ id: row.id })), error: null };
    }

    if (state.op === "delete") {
      if (opts.deleteError) return { data: null, error: { message: "delete failed" } };
      table.rows = table.rows.filter((row) => !matchesState(row));
      return { data: null, error: null };
    }

    return { data: table.rows.filter(matchesState), error: null };
  }

  return {
    from(name: string) {
      assert.equal(name, "smart_alert_claims");
      return makeBuilder({ op: "select", payload: null, updatePayload: null, eqFilters: {}, ltFilters: {}, inFilter: null });
    },
  };
}

function alertOf(key: string, overrides: Partial<SmartAlertLike> = {}): SmartAlertLike {
  return {
    userId: "u1",
    accountName: "账号A",
    userName: "甲",
    tag: "方向B",
    type: "playback_drop",
    dedupeKey: key,
    ...overrides,
  };
}

test("发送前抢占：第一个请求拿到 claim，第二个同 key 被拒（23505）", async () => {
  const table = new FakeClaimTable();
  const alert = alertOf("drop:u1:2026-08-23");

  const first = await claimSmartAlerts(makeClaimClient(table), [alert]);
  assert.equal(first.claims.length, 1);
  assert.equal(first.skippedConcurrentKeys.length, 0);

  const second = await claimSmartAlerts(makeClaimClient(table), [alert]);
  assert.equal(second.claims.length, 0);
  assert.deepEqual(second.skippedConcurrentKeys, [alert.dedupeKey]);
});

test("claim 保存完整告警 payload，状态仍是 claimed", async () => {
  const table = new FakeClaimTable();
  await claimSmartAlerts(makeClaimClient(table), [alertOf("k1")]);

  assert.equal(table.rows[0]?.status, "claimed");
  assert.deepEqual(table.rows[0]?.payload, alertOf("k1"));
});

test("发送成功流转：只更新自己的 claim，并写入 sent_at", async () => {
  const table = new FakeClaimTable();
  const outcome = await claimSmartAlerts(makeClaimClient(table), [alertOf("k1"), alertOf("k2")]);
  const other = table.rows.length;
  // 模拟其他请求的行，不应被触碰
  table.rows.push({
    id: "other-1",
    dedupe_key: "other-key",
    user_id: null,
    target: "other",
    payload: {},
    status: "claimed",
    sent_at: null,
  });

  const result = await markSmartAlertClaimsSent(
    makeClaimClient(table),
    outcome.claims.map((c) => c.id),
  );

  assert.equal(result.ok, true);
  assert.equal(result.transitionedIds.length, 2);
  for (const row of table.rows.slice(0, other)) {
    assert.equal(row.status, "sent");
    assert.ok(row.sent_at);
  }
  assert.equal(table.rows.find((row) => row.id === "other-1")?.status, "claimed");
});

test("已发送 claim 超过24小时会过期，下一周期可以重新抢占", async () => {
  const table = new FakeClaimTable();
  const alert = alertOf("daily-key");
  const first = await claimSmartAlerts(makeClaimClient(table), [alert]);
  await markSmartAlertClaimsSent(makeClaimClient(table), first.claims.map((claim) => claim.id));
  table.rows[0]!.sent_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

  const next = await claimSmartAlerts(makeClaimClient(table), [alert]);

  assert.equal(next.claims.length, 1);
  assert.equal(table.rows[0]?.status, "expired");
  assert.equal(table.rows[1]?.status, "claimed");
});

test("发送失败释放：删除自己的 claim 行，恢复重试资格；删除失败必须暴露", async () => {
  const table = new FakeClaimTable();
  const outcome = await claimSmartAlerts(makeClaimClient(table), [alertOf("k1")]);

  const released = await releaseSmartAlertClaims(
    makeClaimClient(table),
    outcome.claims.map((c) => c.id),
  );
  assert.equal(released.ok, true);
  assert.equal(released.stuckKeysHintCount, 0);
  assert.equal(table.rows.length, 0);

  // 删除失败场景：claim 行滞留，stuck 数量必须暴露
  const table2 = new FakeClaimTable();
  const outcome2 = await claimSmartAlerts(makeClaimClient(table2), [alertOf("k9")]);
  const stuck = await releaseSmartAlertClaims(
    makeClaimClient(table2, { deleteError: true }),
    outcome2.claims.map((c) => c.id),
  );
  assert.equal(stuck.ok, false);
  assert.equal(stuck.stuckKeysHintCount, 1);
  assert.equal(table2.rows.length, 1);
});

test("非唯一冲突的插入错误计入 claimFailedKeys", async () => {
  const table = new FakeClaimTable();
  const outcome = await claimSmartAlerts(makeClaimClient(table, { insertErrorCode: "42501" }), [
    alertOf("k1"),
  ]);

  assert.equal(outcome.claims.length, 0);
  assert.deepEqual(outcome.claimFailedKeys, ["k1"]);
});
