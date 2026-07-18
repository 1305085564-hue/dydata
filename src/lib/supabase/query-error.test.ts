import assert from "node:assert/strict";
import test from "node:test";

import { assertSupabaseQuerySucceeded, SupabaseQueryFailure } from "./query-error";

test("数据库查询失败只公开固定上下文，原始错误保留在 cause", () => {
  const databaseError = { message: "relation public.secret_table does not exist", code: "42P01" };

  assert.throws(
    () => assertSupabaseQuerySucceeded(databaseError, "加载账号失败"),
    (error: unknown) => {
      assert.ok(error instanceof SupabaseQueryFailure);
      assert.equal(error.message, "加载账号失败");
      assert.equal(error.publicMessage, "加载账号失败");
      assert.equal(error.cause, databaseError);
      assert.doesNotMatch(error.message, /secret_table|42P01/);
      return true;
    },
  );
});
