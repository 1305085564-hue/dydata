import assert from "node:assert/strict";
import test from "node:test";

import { buildNotificationDoneResponse, notificationDoneFailureStatus } from "./route";

function deps(user: { id: string } | null, result: boolean | Error, classified = 404) {
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) as never,
    markDone: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    classifyMarkDoneFailure: async () => classified,
  } as never;
}

test("他人通知或不存在通知统一返回安全 404", () => {
  assert.equal(notificationDoneFailureStatus({ data: null, error: null }), 404);
});

test("数据库异常与匹配到通知但更新失败返回 500", () => {
  assert.equal(notificationDoneFailureStatus({ data: null, error: new Error("db down") }), 500);
  assert.equal(notificationDoneFailureStatus({ data: { id: "n1" }, error: null }), 500);
});

test("done handler 成功返回业务与待办分层字段", async () => {
  const response = await buildNotificationDoneResponse("n1", "done", deps({ id: "u1" }, true));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, todoMarked: true });
});

test("done handler 失败明确区分不存在与数据库失败", async () => {
  const missing = await buildNotificationDoneResponse("n1", "done", deps({ id: "u1" }, false, 404));
  assert.equal(missing.status, 404);
  const failed = await buildNotificationDoneResponse("n1", "done", deps({ id: "u1" }, false, 500));
  assert.equal(failed.status, 500);
  const thrown = await buildNotificationDoneResponse("n1", "done", deps({ id: "u1" }, new Error("db")));
  assert.equal(thrown.status, 500);
});
