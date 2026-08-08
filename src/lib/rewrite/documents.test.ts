import test from "node:test";
import assert from "node:assert/strict";

import { splitIntoParagraphs } from "./documents";

test("短标题与下一段合并，完整句子保持独立", () => {
  assert.deepEqual(splitIntoParagraphs("标题：\n\n这里是正文。\n\n独立句子！"), ["标题：\n这里是正文。", "独立句子！"]);
});

test("空内容返回空数组，空段落被忽略", () => {
  assert.deepEqual(splitIntoParagraphs(""), []);
  assert.deepEqual(splitIntoParagraphs("\n\n  \n\n"), []);
});
