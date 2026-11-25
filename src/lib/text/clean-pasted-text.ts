import type { ClipboardEvent } from "react";

// 剥离飞书 / Word / 公众号常见的零宽字符、方向控制符、软连字符、对象占位符与控制符
const HIDDEN_TEXT_CHARS_RE =
  /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD\uFFFC\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// 把不间断空格等异形空白折叠为常规空格，方便行尾修剪
const EXOTIC_SPACES_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F]/g;

/**
 * 清洗长文案粘贴内容：
 * - 统一换行符并剥离不可见格式化字符；
 * - 去掉每行行尾多余空格，并把连续 3 个及以上换行压成正常段落空行（\n\n）；
 * - 去掉首尾冗余空白，同时完整保留段落间的单个空行。
 */
export function cleanLongTextPaste(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(HIDDEN_TEXT_CHARS_RE, "")
    .replace(EXOTIC_SPACES_RE, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 在 textarea 的 onPaste 中就地清洗纯文本粘贴，不拦截图片或非文本剪贴板数据。
 * 若选区覆盖旧内容，仅替换选区范围并恢复光标到粘贴文本末尾。
 */
export function applyCleanedTextareaPaste(
  event: ClipboardEvent<HTMLTextAreaElement>,
  currentValue: string,
  onChange: (nextValue: string) => void,
): boolean {
  const raw = event.clipboardData?.getData("text/plain");
  if (!raw) return false;

  const cleaned = cleanLongTextPaste(raw);
  const textarea = event.currentTarget;
  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? currentValue.length;
  const nextValue = currentValue.slice(0, start) + cleaned + currentValue.slice(end);
  const nextCaret = start + cleaned.length;

  event.preventDefault();
  onChange(nextValue);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      if (document.contains(textarea)) {
        textarea.setSelectionRange(nextCaret, nextCaret);
      }
    });
  }
  return true;
}
