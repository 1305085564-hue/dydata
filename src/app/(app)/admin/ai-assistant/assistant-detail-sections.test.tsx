import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import AssistantDetailSections from "./assistant-detail-sections";

test("有 details 时会渲染结构化字段卡和表格，而不是原始 JSON", () => {
  const html = renderToStaticMarkup(
    <AssistantDetailSections
      details={{
        sections: [
          {
            kind: "fields",
            title: "关键数字",
            items: [{ label: "异常数量", value: "3" }],
          },
          {
            kind: "table",
            title: "明细",
            columns: ["日期", "姓名", "问题"],
            rows: [["2026/4/8", "张三", "未提交日报"]],
          },
        ],
        nextSteps: ["继续按日期再筛一遍"],
      }}
    />,
  );

  assert.match(html, /关键数字/);
  assert.match(html, /<table/);
  assert.match(html, /继续按日期再筛一遍/);
  assert.doesNotMatch(html, /\{\"/);
});
