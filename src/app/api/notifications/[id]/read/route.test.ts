import assert from "node:assert/strict";
import test from "node:test";

import { buildNotificationReadResponse } from "./route";

function deps(user: { id: string } | null, result: boolean | Error) {
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) as never,
    markRead: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  } as never;
}

test("read handler 成功返回业务结果", async () => {
  const response = await buildNotificationReadResponse("n1", deps({ id: "u1" }, true));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("read handler 未登录、失败与 thrown 均明确失败", async () => {
  assert.equal((await buildNotificationReadResponse("n1", deps(null, true))).status, 401);
  assert.equal((await buildNotificationReadResponse("n1", deps({ id: "u1" }, false))).status, 500);
  assert.equal((await buildNotificationReadResponse("n1", deps({ id: "u1" }, new Error("db")))).status, 500);
});
