import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GroupModeSettingsControl } from "./premium-settings-modal";

test("设置弹窗在没有集团资格时显示公司模式和资格说明，但不提供进入按钮", () => {
  const markup = renderToStaticMarkup(
    <GroupModeSettingsControl
      canEnterGroupMode={false}
      isGroupModeActive={false}
      pending={false}
      onChange={() => undefined}
    />,
  );

  assert.match(markup, /data-testid="group-mode-settings-control"/);
  assert.match(markup, /公司模式/);
  assert.match(markup, /未获集团资格/);
  assert.doesNotMatch(markup, />进入</);
});

test("设置弹窗只在拥有集团资格时渲染集团模式开关", () => {
  const markup = renderToStaticMarkup(
    <GroupModeSettingsControl
      canEnterGroupMode
      isGroupModeActive={false}
      pending={false}
      onChange={() => undefined}
    />,
  );

  assert.match(markup, /data-testid="group-mode-settings-control"/);
  assert.match(markup, /公司模式/);
  assert.match(markup, />进入</);
});
