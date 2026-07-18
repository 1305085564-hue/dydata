import assert from "node:assert/strict";
import test from "node:test";

import { assertRpcSuccess } from "./data";

test("管理队列 RPC 出错时抛错，避免把失败显示成空队列", () => {
  const databaseError = { message: "relation public.secret_table does not exist" };
  assert.throws(
    () => assertRpcSuccess({ data: null, error: databaseError }, "待审核队列"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "待审核队列加载失败");
      assert.equal(error.cause, databaseError);
      assert.doesNotMatch(JSON.stringify(error), /secret_table/);
      return true;
    },
  );
});

test("管理队列 RPC 成功时返回原数据", () => {
  const payload = { pending_review: [] };
  assert.equal(assertRpcSuccess({ data: payload, error: null }, "待审核队列"), payload);
});
