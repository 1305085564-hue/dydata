import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ApprovedListEmptyState } from "./approved-list";

test("归档案例为空时不再提供失效的上传入口", () => {
  const html = renderToStaticMarkup(<ApprovedListEmptyState hasFilters={false} />);

  assert.match(html, /仅保留历史记录/);
  assert.doesNotMatch(html, /去上传凭证/);
  assert.doesNotMatch(html, /<button/);
});

test("搜索无结果时明确提示调整筛选条件", () => {
  const html = renderToStaticMarkup(<ApprovedListEmptyState hasFilters />);

  assert.match(html, /调整搜索词或关闭「只看自己」/);
});
