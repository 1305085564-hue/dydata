import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const globalEntryFiles = [
  "src/app/(app)/template.tsx",
  "src/components/nav-bar-client.tsx",
  "src/components/ui/scroll-to-top.tsx",
  "src/components/workspace-picker.tsx",
];

test("登录后全局入口不再静态引入 Framer Motion", () => {
  for (const file of globalEntryFiles) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /from ["']framer-motion["']/, file);
  }
});

test("路由模板保持为服务端组件", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/template.tsx"), "utf8");
  assert.doesNotMatch(source, /^["']use client["'];/m);
});

