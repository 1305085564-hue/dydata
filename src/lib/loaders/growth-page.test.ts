import test from "node:test";
import assert from "node:assert/strict";

import { __internal } from "./growth-page";

test("成长页只把约定的内容脚本缺字段错误视为可降级", () => {
  assert.equal(__internal.isMissingContentScriptSchemaError({ message: "Could not find the 'owner_user_id' column of 'content_item' in the schema cache" }), true);
  assert.equal(__internal.isMissingContentScriptSchemaError({ message: "relation content_item does not exist" }), false);
  assert.equal(__internal.isMissingContentScriptSchemaError(null), false);
  assert.equal(__internal.isMissingContentScriptSchemaError({ message: "network down" }), false);
});

test("缓存命中缺表后空查询直接返回空上下文", async () => {
  __internal.resetContentScriptSchemaCache();
  const query = { select: () => query, eq: () => query, then: (resolve: (value: unknown) => void) => Promise.resolve({ data: null, error: { message: "Could not find the 'account_id' column of 'content_item' in the schema cache" } }).then(resolve) };
  const result = await __internal.loadScriptContextData({ from: () => query } as never, "u1");
  assert.deepEqual(result, { contentItems: [], scriptDocuments: [], scriptSegments: [] });
});
