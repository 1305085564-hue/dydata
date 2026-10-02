import assert from "node:assert/strict";
import test from "node:test";

import { notificationDoneFailureStatus } from "./route";

test("他人通知或不存在通知统一返回安全 404", () => {
  assert.equal(notificationDoneFailureStatus({ data: null, error: null }), 404);
});

test("数据库异常与匹配到通知但更新失败返回 500", () => {
  assert.equal(notificationDoneFailureStatus({ data: null, error: new Error("db down") }), 500);
  assert.equal(notificationDoneFailureStatus({ data: { id: "n1" }, error: null }), 500);
});
