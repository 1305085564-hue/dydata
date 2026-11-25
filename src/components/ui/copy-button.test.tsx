import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { COPY_FEEDBACK_MS, CopyButton } from "./copy-button";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

test("CopyButton 默认渲染为可点击按钮并采用 2000ms 原地反馈时长", () => {
  assert.equal(COPY_FEEDBACK_MS, 2000);
  const html = renderToStaticMarkup(<CopyButton text="https://example.com" label="复制链接" />);
  assert.match(html, /type="button"/);
  assert.match(html, />复制链接</);
  assert.doesNotMatch(html, /data-copied="true"/);
});

test("四处独立复制入口均接入 CopyButton 且复制成功不再弹出提示横幅", () => {
  const copyButtonSrc = read("src/components/ui/copy-button.tsx");
  assert.doesNotMatch(copyButtonSrc, /toast\.success|feedbackToast\.success/);

  for (const rel of [
    "src/app/(app)/people/[userId]/copy-profile-link-button.tsx",
    "src/app/(app)/admin/content/content-detail-dialog.tsx",
    "src/app/(app)/admin/ai-config/components/model-channel-row.tsx",
    "src/app/(app)/admin/ai-config/components/model-test-feedback.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /<CopyButton/, `${rel} 应使用统一 CopyButton`);
    assert.doesNotMatch(
      src,
      /已复制成员主页链接|文案已复制到剪贴板|已复制 Request ID|已复制请求编号/,
      `${rel} 复制成功不应再弹成功横幅`,
    );
  }
});
