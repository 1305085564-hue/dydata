import test from "node:test";
import assert from "node:assert/strict";

import {
  getSafeAccountDisplayName,
  isUuidLike,
  uniqueNonEmpty,
} from "./shared";

test("账号名优先备注并隐藏 UUID 式原始名", () => {
  assert.equal(getSafeAccountDisplayName({ rawName: "原名", remark: " 备注 ", userDisplayName: "小陈", contentDirection: null, index: 0, total: 1 }), "备注");
  assert.equal(getSafeAccountDisplayName({ rawName: "550e8400-e29b-41d4-a716-446655440000", userDisplayName: "小陈", contentDirection: null, index: 0, total: 1 }), "抖音-小陈");
  assert.equal(isUuidLike(null), false);
});

test("空值去除、去重并保留首次顺序", () => {
  assert.deepEqual(uniqueNonEmpty([null, "", " A ", "A", undefined, "B"]), ["A", "B"]);
  assert.deepEqual(uniqueNonEmpty([]), []);
});
