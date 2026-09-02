import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  extractClipboardImageFiles,
  isEditablePasteTarget,
} from "./截图粘贴";

test("首页粘贴时只提取剪贴板里的图片", () => {
  const image = new File(["image"], "clipboard.png", { type: "image/png" });
  const files = extractClipboardImageFiles([
    { type: "text/plain", getAsFile: () => null },
    { type: "image/png", getAsFile: () => image },
  ]);

  assert.deepEqual(files, [image]);
});

test("文案和输入控件保留自己的粘贴行为", () => {
  assert.equal(isEditablePasteTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditablePasteTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditablePasteTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isEditablePasteTarget({ tagName: "DIV" }), false);
});

test("截图组件在首页范围监听粘贴，不再要求先点中截图卡", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/submission/截图槽位区.tsx"),
    "utf8",
  );

  assert.match(source, /document\.addEventListener\("paste"/);
  assert.match(source, /document\.removeEventListener\("paste"/);
  assert.doesNotMatch(source, /<div\s+onPaste=/);
});

test("空截图卡悬停时轻提示可直接粘贴", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/submission/截图槽位区.tsx"),
    "utf8",
  );

  assert.match(source, /group-hover:hidden/);
  assert.match(source, /hidden group-hover:inline/);
  assert.match(source, /也可直接 ⌘V \/ Ctrl\+V/);
  assert.match(source, /truncate hidden sm:block/);
  assert.doesNotMatch(source, /truncate hidden xs:block/);
});
