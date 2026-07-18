import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TopicSuggest } from "./topic-suggest";

test("选题工具初次进入时说明下一步，而不是留下空白区域", () => {
  const html = renderToStaticMarkup(<TopicSuggest accounts={[]} />);

  assert.match(html, /选择账号范围和统计范围/);
  assert.match(html, /生成选题建议/);
});
