import assert from "node:assert/strict";
import test from "node:test";
import type { ClipboardEvent } from "react";
import { applyCleanedTextareaPaste, cleanLongTextPaste } from "./clean-pasted-text";

test("cleanLongTextPaste 剥离源文档隐藏字符、异形空格与冗余空行，保留正常段落空行", () => {
  const dirty =
    "\uFEFF\n\n  第一段开头\u200B\u00A0含隐藏字符\u200E   \r\n" +
    "   \r\n\r\n\r\n" +
    "第二段正文\u00AD软连字符\uFFFC对象符\t \u2028" +
    "第三行紧接第二段\n\n\n";

  const expected =
    "第一段开头 含隐藏字符\n\n第二段正文软连字符对象符\n第三行紧接第二段";

  assert.equal(cleanLongTextPaste(dirty), expected);
});

test("cleanLongTextPaste 保留正常双换行分段，不误删段落间隙", () => {
  const clean = "开头钩子\n\n核心观点\n\n结尾互动";
  assert.equal(cleanLongTextPaste(clean), clean);
  assert.equal(cleanLongTextPaste(""), "");
  assert.equal(cleanLongTextPaste("  \n\t  "), "");
});

test("applyCleanedTextareaPaste 在选区就地替换纯文本并阻止原生重复粘贴", () => {
  let prevented = false;
  let updated = "";
  const textarea = {
    selectionStart: 2,
    selectionEnd: 5,
    setSelectionRange: () => {},
  } as unknown as HTMLTextAreaElement;

  const handled = applyCleanedTextareaPaste(
    {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "\u200B你好\r\n\r\n\r\n世界  " : ""),
      },
      currentTarget: textarea,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as ClipboardEvent<HTMLTextAreaElement>,
    "前面旧内容后面",
    (next) => {
      updated = next;
    },
  );

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.equal(updated, "前面你好\n\n世界后面");
});

test("applyCleanedTextareaPaste 在纯图片粘贴（无 text/plain）时不拦截，放行全局贴图监听", () => {
  let prevented = false;
  let changed = false;
  const handled = applyCleanedTextareaPaste(
    {
      clipboardData: {
        getData: () => "",
      },
      currentTarget: { selectionStart: 0, selectionEnd: 0 } as unknown as HTMLTextAreaElement,
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as ClipboardEvent<HTMLTextAreaElement>,
    "已有文案",
    () => {
      changed = true;
    },
  );

  assert.equal(handled, false);
  assert.equal(prevented, false);
  assert.equal(changed, false);
});
