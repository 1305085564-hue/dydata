import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeCanvasOutput } from "./generation";

test("画布输出移除对话包装并保留正文段落", () => {
  assert.equal(sanitizeCanvasOutput("好的：\n\n修改后：这是正文\n\n第二段"), "这是正文\n\n第二段");
});

test("空文本返回空，普通正文不被改写", () => {
  assert.equal(sanitizeCanvasOutput("  "), "");
  assert.equal(sanitizeCanvasOutput("第一段\r\n\r\n第二段"), "第一段\n\n第二段");
});
