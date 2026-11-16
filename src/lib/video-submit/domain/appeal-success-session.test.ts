import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAppealSuccessSession,
  getAppealSuccessPublishedAt,
  getAppealSuccessTitle,
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
  markAppealSuccessSession(storage, "account-1", "2026-11-16", "真实标题", "2026-11-11 21:00");
  assert.equal(hasAppealSuccessSession(storage, "account-1", "2026-11-16"), true);
  assert.equal(getAppealSuccessTitle(storage, "account-1", "2026-11-16"), "真实标题");
  // 刷新后成功态要能拿回原发布时间，否则会退化成默认业务日期
  assert.equal(getAppealSuccessPublishedAt(storage, "account-1", "2026-11-16"), "2026-11-11 21:00");
  clearAppealSuccessSession(storage, "account-1", "2026-11-16");
  assert.equal(hasAppealSuccessSession(storage, "account-1", "2026-11-16"), false);
  assert.equal(getAppealSuccessPublishedAt(storage, "account-1", "2026-11-16"), null);
});

test("旧版字符串标记仍被识别，且不臆造标题与发布时间", () => {
  const values = new Map<string, string>([["dydata:appeal-success:account-2:2026-11-16", "1"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  assert.equal(hasAppealSuccessSession(storage, "account-2", "2026-11-16"), true);
  assert.equal(getAppealSuccessTitle(storage, "account-2", "2026-11-16"), null);
  assert.equal(getAppealSuccessPublishedAt(storage, "account-2", "2026-11-16"), null);
});
