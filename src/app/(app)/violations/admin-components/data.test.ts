import assert from "node:assert/strict";
import test from "node:test";

import { assertRpcSuccess } from "./data";

test("管理队列 RPC 出错时抛错，避免把失败显示成空队列", () => {
  assert.throws(
    () => assertRpcSuccess({ data: null, error: { message: "RPC 不可用" } }, "待审核队列"),
    /待审核队列加载失败：RPC 不可用/,
  );
});

test("管理队列 RPC 成功时返回原数据", () => {
  const payload = { pending_review: [] };
  assert.equal(assertRpcSuccess({ data: payload, error: null }, "待审核队列"), payload);
});
