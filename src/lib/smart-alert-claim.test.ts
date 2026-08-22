import assert from "node:assert/strict";
import test from "node:test";

import {
  claimSmartAlerts,
  markSmartAlertClaimsSent,
  releaseSmartAlertClaims,
  type SmartAlertLike,
} from "./smart-alert-claim";

// ── 有状态假表：模拟 audit_logs 的 dedupeKey 部分唯一索引 ──

type AuditRow = {
  id: string;
  action: string;
  detail: string;
  user_id: string | null;
};

class FakeAuditTable {
  rows: AuditRow[] = [];
  private seq = 0;

  nextId(): string {
    return `a${++this.seq}`;
  }

  /** 模拟唯一索引：action ∈ (smart_alert_claim, smart_alert) 的 dedupeKey 唯一 */
  findActive(dedupeKey: string): AuditRow | undefined {
    return this.rows.find((row) => {
      if (row.action !== "smart_alert_claim" && row.action !== "smart_alert") return false;
      try {
        return JSON.parse(row.detail).dedupeKey === dedupeKey;
      } catch {
        return false;
      }
    });
  }
}

interface AuditQueryResult {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message?: string } | null;
}

interface AuditBuilder {
  insert(payload: Record<string, unknown>): AuditBuilder;
  update(payload: Record<string, unknown>): AuditBuilder;
  delete(): AuditBuilder;
  select(cols?: string): AuditBuilder;
  eq(col: string, val: unknown): AuditBuilder;
  in(col: string, values: unknown[]): AuditBuilder;
  then(resolve: (value: AuditQueryResult) => void, reject?: (reason?: unknown) => void): void;
}

function makeAuditClient(table: FakeAuditTable, opts: { insertErrorCode?: string; deleteError?: boolean } = {}) {
  interface AuditState {
    op: "select" | "insert" | "update" | "delete";
    payload: Record<string, unknown> | null;
    updatePayload: Record<string, unknown> | null;
    eqFilters: Record<string, unknown>;
    inFilter: { col: string; values: unknown[] } | null;
  }
  function makeBuilder(state: AuditState): AuditBuilder {
    const builder: AuditBuilder = {
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: unknown) {
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
      in(col: string, values: unknown[]) {
        state.inFilter = { col, values };
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        resolve(exec(state));
      },
    };
    return builder;
  }

  function exec(state: AuditState): AuditQueryResult {
    const matchesState = (row: AuditRow) => {
      for (const [col, val] of Object.entries(state.eqFilters)) {
        if ((row as Record<string, unknown>)[col] !== val) return false;
      }
      if (
        state.inFilter &&
        !state.inFilter.values.includes((row as Record<string, unknown>)[state.inFilter.col])
      ) {
        return false;
      }
      return true;
    };

    if (state.op === "insert") {
      if (opts.insertErrorCode) return { data: null, error: { code: opts.insertErrorCode } };
      let key: string | null = null;
      try {
        key = JSON.parse(state.payload.detail).dedupeKey ?? null;
      } catch {
        key = null;
      }
      if (key && table.findActive(key)) {
        return { data: null, error: { code: "23505" } };
      }
      const row: AuditRow = {
        id: table.nextId(),
        action: state.payload.action,
        detail: state.payload.detail,
        user_id: state.payload.user_id,
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
      const before = table.rows.length;
      table.rows = table.rows.filter((row) => !matchesState(row));
      return { data: null, error: null, count: before - table.rows.length };
    }

    return { data: table.rows.filter(matchesState), error: null };
  }

  return {
    from(name: string) {
      assert.equal(name, "audit_logs");
      return makeBuilder({ op: "select", payload: null, updatePayload: null, eqFilters: {}, inFilter: null });
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
  const table = new FakeAuditTable();
  const alert = alertOf("drop:u1:2026-08-23");

  const first = await claimSmartAlerts(makeAuditClient(table), [alert]);
  assert.equal(first.claims.length, 1);
  assert.equal(first.skippedConcurrentKeys.length, 0);

  const second = await claimSmartAlerts(makeAuditClient(table), [alert]);
  assert.equal(second.claims.length, 0);
  assert.deepEqual(second.skippedConcurrentKeys, [alert.dedupeKey]);
});

test("claim 行的 action 是 smart_alert_claim，不会被去重解析当成已发告警", async () => {
  const table = new FakeAuditTable();
  await claimSmartAlerts(makeAuditClient(table), [alertOf("k1")]);

  assert.equal(table.rows[0]?.action, "smart_alert_claim");
});

test("发送成功流转：只更新自己的 claim，流转后成为 smart_alert", async () => {
  const table = new FakeAuditTable();
  const outcome = await claimSmartAlerts(makeAuditClient(table), [alertOf("k1"), alertOf("k2")]);
  const other = table.rows.length;
  // 模拟其他请求的行，不应被触碰
  table.rows.push({ id: "other-1", action: "smart_alert_claim", detail: JSON.stringify({ dedupeKey: "other-key" }), user_id: null });

  const result = await markSmartAlertClaimsSent(
    makeAuditClient(table),
    outcome.claims.map((c) => c.id),
  );

  assert.equal(result.ok, true);
  assert.equal(result.transitionedIds.length, 2);
  for (const row of table.rows.slice(0, other)) {
    assert.equal(row.action, "smart_alert");
  }
  assert.equal(table.rows.find((row) => row.id === "other-1")?.action, "smart_alert_claim");
});

test("发送失败释放：删除自己的 claim 行，恢复重试资格；删除失败必须暴露", async () => {
  const table = new FakeAuditTable();
  const outcome = await claimSmartAlerts(makeAuditClient(table), [alertOf("k1")]);

  const released = await releaseSmartAlertClaims(
    makeAuditClient(table),
    outcome.claims.map((c) => c.id),
  );
  assert.equal(released.ok, true);
  assert.equal(released.stuckKeysHintCount, 0);
  assert.equal(table.rows.length, 0);

  // 删除失败场景：claim 行滞留，stuck 数量必须暴露
  const table2 = new FakeAuditTable();
  const outcome2 = await claimSmartAlerts(makeAuditClient(table2), [alertOf("k9")]);
  const stuck = await releaseSmartAlertClaims(
    makeAuditClient(table2, { deleteError: true }),
    outcome2.claims.map((c) => c.id),
  );
  assert.equal(stuck.ok, false);
  assert.equal(stuck.stuckKeysHintCount, 1);
  assert.equal(table2.rows.length, 1);
});

test("非唯一冲突的插入错误计入 claimFailedKeys", async () => {
  const table = new FakeAuditTable();
  const outcome = await claimSmartAlerts(makeAuditClient(table, { insertErrorCode: "42501" }), [
    alertOf("k1"),
  ]);

  assert.equal(outcome.claims.length, 0);
  assert.deepEqual(outcome.claimFailedKeys, ["k1"]);
});
