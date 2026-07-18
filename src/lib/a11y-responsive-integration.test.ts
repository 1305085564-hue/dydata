import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("含子控件的卡片不再把外层伪装成按钮", () => {
  const paths = [
    "src/app/(app)/admin/ai-config/components/providers-client.tsx",
    "src/app/(app)/admin/ai-config/components/rewrite-client.tsx",
    "src/app/(app)/admin/content/content-list.tsx",
    "src/app/(app)/admin/modules/modules-content-v2.tsx",
    "src/app/(app)/dashboard/history-list.tsx",
    "src/app/(app)/video-review/components/case-card.tsx",
  ];

  for (const path of paths) {
    const source = readSource(path);
    assert.doesNotMatch(source, /role="button"/, `${path} 仍含嵌套伪按钮`);
    assert.match(source, /<(?:button|Button)\b/, `${path} 应提供原生键盘入口`);
  }
});

test("权限抽屉手机全宽且桌面固定为 480px", () => {
  const source = readSource("src/app/(app)/admin/permission-manager.tsx");
  assert.match(source, /w-full sm:w-\[480px\] sm:max-w-\[480px\]/);
  assert.doesNotMatch(source, /sm:max-w-none/);
});

test("语义状态色分别提供浅色与暗色对比色", () => {
  const source = readSource("src/lib/tailwind-utils.ts");
  assert.match(source, /text-\[#3F7A4E\][^\n]*dark:text-\[#6FAA7D\]/);
  assert.match(source, /text-\[#8F641B\][^\n]*dark:text-\[#D99E55\]/);
  assert.match(source, /text-\[#B24E3E\][^\n]*dark:text-\[#D16A58\]/);
});

test("触屏与键盘都能看到卡片操作，当前选择会暴露给读屏", () => {
  const providers = readSource("src/app/(app)/admin/ai-config/components/providers-client.tsx");
  const rewrite = readSource("src/app/(app)/admin/ai-config/components/rewrite-client.tsx");
  const modules = readSource("src/app/(app)/admin/modules/modules-content-v2.tsx");
  const caseCard = readSource("src/app/(app)/video-review/components/case-card.tsx");

  for (const source of [providers, rewrite, modules]) {
    assert.match(source, /aria-current=/);
  }
  assert.match(providers, /opacity-100[^\n]*sm:opacity-0[^\n]*sm:group-focus-within:opacity-100/);
  assert.match(rewrite, /opacity-100[^\n]*sm:opacity-0[^\n]*sm:group-focus-within:opacity-100/);
  assert.match(modules, /pointer-events-auto[^\n]*sm:pointer-events-none[^\n]*sm:group-focus-within:pointer-events-auto/);
  assert.match(caseCard, /opacity-100[^\n]*sm:opacity-0[^\n]*sm:group-focus-within:opacity-100/);
});

test("默认展开的渠道第一次点击即可收起", () => {
  const source = readSource("src/app/(app)/admin/ai-config/components/providers-client.tsx");
  assert.match(source, /\[id\]: !\(prev\[id\] !== false\)/);
});
