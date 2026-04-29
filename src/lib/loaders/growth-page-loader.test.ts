import assert from "node:assert/strict";
import test from "node:test";

import { __internal } from "./growth-page";

class FakeQuery {
  constructor(
    private readonly table: string,
    private readonly calls: string[],
  ) {}

  select() {
    this.calls.push(this.table);
    return this;
  }

  eq() {
    return this;
  }

  then(resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void) {
    const result =
      this.table === "content_item"
        ? {
            data: null,
            error: {
              message: "Could not find the 'account_id' column of 'content_item' in the schema cache",
            },
          }
        : { data: [], error: null };

    return Promise.resolve(result).then(resolve);
  }
}

function createFakeSupabase(calls: string[]) {
  return {
    from(table: string) {
      return new FakeQuery(table, calls);
    },
  };
}

test("成长页脚本字段缺失时不继续查询脚本文档和脚本分段", async () => {
  __internal.resetContentScriptSchemaCache();
  const calls: string[] = [];

  const result = await __internal.loadScriptContextData(createFakeSupabase(calls) as never, "user-1");

  assert.deepEqual(result, {
    contentItems: [],
    scriptDocuments: [],
    scriptSegments: [],
  });
  assert.deepEqual(calls, ["content_item"]);
});

test("成长页脚本字段缺失会缓存兼容状态，下一次直接跳过脚本链路", async () => {
  const calls: string[] = [];

  await __internal.loadScriptContextData(createFakeSupabase(calls) as never, "user-1");

  assert.deepEqual(calls, []);
  __internal.resetContentScriptSchemaCache();
});
