import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("CSS 自定义属性不允许自引用（循环引用会让 token 整体失效）", () => {
  const files = [
    "src/app/globals.css",
    ...readdirSync(resolve(process.cwd(), "src/styles"))
      .filter((name) => name.endsWith(".css"))
      .map((name) => `src/styles/${name}`),
  ];

  for (const file of files) {
    for (const [index, line] of readSource(file).split("\n").entries()) {
      const match = /^\s*(--[a-zA-Z0-9-]+):\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, token, value] = match as unknown as [string, string, string];
      assert.ok(
        !value.includes(`var(${token})`),
        `${file}:${index + 1} 自定义属性 ${token} 自引用，属于循环引用`,
      );
    }
  }
});

test("--font-display 使用真实可用的系统字体栈（不再依赖已移除的 Google Fonts）", () => {
  const globals = readSource("src/app/globals.css");
  assert.match(globals, /--font-display:[^;]*'PingFang SC'/);
  assert.doesNotMatch(globals, /fonts\.googleapis|fonts\.gstatic/);
});
