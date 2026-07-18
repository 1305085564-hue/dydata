import test from "node:test";
import assert from "node:assert/strict";

import {
  getDashboardSnapshot,
  initDashboardStore,
  setDashboardAccount,
  setDashboardDate,
  subscribeDashboardStore,
} from "./dashboard-store";

test("工作台 store 初始化、更新、空值与取消订阅行为稳定", () => {
  let changes = 0;
  const unsubscribe = subscribeDashboardStore(() => { changes += 1; });
  initDashboardStore({ accounts: [{ id: "a1", name: "账号", display_name: "账号", content_direction: null }], selectedAccountId: "a1", activeBizDate: "2026-07-18" });
  assert.equal(getDashboardSnapshot().accounts.length, 1);
  assert.equal(getDashboardSnapshot().selectedAccountId, "a1");

  const beforeNoop = changes;
  setDashboardAccount("a1");
  setDashboardDate("2026-07-18");
  initDashboardStore({ accounts: [] });
  assert.equal(changes, beforeNoop);

  setDashboardAccount("");
  setDashboardDate("");
  assert.equal(getDashboardSnapshot().activeBizDate, "");
  unsubscribe();
  const beforeUnsubscribed = changes;
  setDashboardDate("2026-07-19");
  assert.equal(changes, beforeUnsubscribed);
});
