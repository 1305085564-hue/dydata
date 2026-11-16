import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAppealSuccessSession,
  hasAppealSuccessSession,
  markAppealSuccessSession,
} from "./appeal-success-session";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

test("审批成功会话标记可跨刷新保留，并能在开启新填报时清掉", () => {
  const storage = createStorage();

  assert.equal(hasAppealSuccessSession(storage, "account-1", "2026-11-16"), false);
  markAppealSuccessSession(storage, "account-1", "2026-11-16");
  assert.equal(hasAppealSuccessSession(storage, "account-1", "2026-11-16"), true);
  clearAppealSuccessSession(storage, "account-1", "2026-11-16");
  assert.equal(hasAppealSuccessSession(storage, "account-1", "2026-11-16"), false);
});
