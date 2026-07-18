import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ApprovedArchiveEmptyState } from "./approved-list-data-container";

test("已发案例为空时不再链接到已归档的提交页", () => {
  const html = renderToStaticMarkup(<ApprovedArchiveEmptyState query="" />);

  assert.match(html, /仅保留历史记录/);
  assert.doesNotMatch(html, /video-review\/submit/);
  assert.doesNotMatch(html, /上传待审稿/);
});
