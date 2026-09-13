import test from "node:test";
import assert from "node:assert/strict";

import {
  getDashboardSnapshot,
  initDashboardStore,
  selectDashboardAccount,
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

test("selectDashboardAccount 会更新工作台账号并派发页面联动事件", () => {
  const events: Array<{ detail?: { key?: string; accountId?: string } }> = [];
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent(event: Event) {
        events.push(event as CustomEvent<{ key: string; accountId: string }>);
        return true;
      },
    },
  });

  try {
    setDashboardAccount("a1");
    selectDashboardAccount("a2");

    assert.equal(getDashboardSnapshot().selectedAccountId, "a2");
    assert.deepEqual(events.map((event) => event.detail), [
      { key: "set-account", accountId: "a2" },
    ]);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
