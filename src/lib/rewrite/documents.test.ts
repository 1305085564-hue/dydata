import test from "node:test";
import assert from "node:assert/strict";

import { getOrCreateDocument, splitIntoParagraphs } from "./documents";

test("短标题与下一段合并，完整句子保持独立", () => {
  assert.deepEqual(splitIntoParagraphs("标题：\n\n这里是正文。\n\n独立句子！"), ["标题：\n这里是正文。", "独立句子！"]);
});

test("空内容返回空数组，空段落被忽略", () => {
  assert.deepEqual(splitIntoParagraphs(""), []);
  assert.deepEqual(splitIntoParagraphs("\n\n  \n\n"), []);
});

test("读取 rewrite document 失败时抛错，不继续插入新文档", async () => {
  let inserted = false;
  const service = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        insert() {
          inserted = true;
          return this;
        },
        async maybeSingle() {
          return { data: null, error: { message: "rewrite_documents unavailable" } };
        },
        async single() {
          return { data: { id: "doc-1" }, error: null };
        },
      };
    },
  };

  await assert.rejects(
    () => getOrCreateDocument(service, "conversation-1"),
    /rewrite_documents unavailable|读取 document 失败/,
  );
  assert.equal(inserted, false);
});
