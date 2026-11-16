import assert from "node:assert/strict";
import test from "node:test";

import { persistDraftToStorage } from "./use-form-draft";

function createStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

test("已提交表单触发 pagehide 时不会把草稿重新写回存储", () => {
  const storage = createStorage();
  const key = "dydata:draft:test";

  const result = persistDraftToStorage(storage, key, { title: "已提交" }, () => false, null, true);

  assert.equal(result.saved, false);
  assert.equal(storage.getItem(key), null);
});

test("未暂停的表单仍会写入最新草稿", () => {
  const storage = createStorage();
  const result = persistDraftToStorage(storage, "dydata:draft:test", { title: "继续填写" }, () => false, null, false);

  assert.equal(result.saved, true);
  assert.ok(storage.getItem("dydata:draft:test"));
});
