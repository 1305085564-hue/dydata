import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ExemptionHistoryEmpty, ExemptionHistoryError } from "./exemption-workbench";

test("豁免历史加载失败时显示错误与重试，不伪装成空记录", () => {
  const html = renderToStaticMarkup(
    <ExemptionHistoryError message="数据库暂时不可用" onRetry={() => {}} pending={false} />,
  );

  assert.match(html, /申请历史加载失败/);
  assert.match(html, /数据库暂时不可用/);
  assert.match(html, /重新加载/);
  assert.doesNotMatch(html, /暂无历史申请记录/);
});

test("归档豁免历史为空时不再提供无法操作的新建按钮", () => {
  const html = renderToStaticMarkup(<ExemptionHistoryEmpty />);

  assert.match(html, /仅保留历史记录/);
  assert.doesNotMatch(html, /新建申请记录/);
  assert.doesNotMatch(html, /<button/);
});
