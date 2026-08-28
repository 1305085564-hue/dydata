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

test("shadcn 状态变体由本地 CSS 提供，不依赖命令行工具包参与生产构建", () => {
  const globals = readSource("src/app/globals.css");
  const variants = readSource("src/styles/shadcn-state-variants.css");
  const packageJson = JSON.parse(readSource("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.match(globals, /@import "\.\.\/styles\/shadcn-state-variants\.css"/);
  assert.doesNotMatch(globals, /shadcn\/tailwind\.css/);

  for (const name of [
    "data-open",
    "data-closed",
    "data-checked",
    "data-unchecked",
    "data-selected",
    "data-disabled",
    "data-active",
    "data-horizontal",
    "data-vertical",
  ]) {
    assert.match(variants, new RegExp(`@custom-variant ${name}\\b`));
  }

  assert.equal(packageJson.dependencies?.shadcn, undefined);
  assert.equal(packageJson.devDependencies?.shadcn, undefined);
});

test("Windows 低密度屏有专用中文可读性兜底", () => {
  const globals = readSource("src/app/globals.css");
  const layout = readSource("src/app/layout.tsx");

  assert.match(layout, /dataset\.os = "windows"/);
  assert.match(layout, /dataset\.textDensity = "low"/);
  assert.match(globals, /html\[data-os="windows"\]\[data-text-density="low"\] body/);
  assert.match(globals, /font-family: var\(--font-sans\)/);
  assert.match(globals, /text-\\\[13\\\.5px\\\]/);
});

test("Windows 低密度屏优先使用 YaHei UI，并只加深不透明的辅助墨", () => {
  const globals = readSource("src/app/globals.css");

  assert.match(globals, /--font-sans:[^;]*Microsoft YaHei UI/);
  assert.match(globals, /--font-display:[^;]*Microsoft YaHei UI/);
  assert.match(
    globals,
    /html\[data-os="windows"\]\[data-text-density="low"\]:not\(\.dark\)/,
  );
  assert.match(globals, /--color-text-tertiary:\s*#57534E/);
  assert.match(globals, /--muted-foreground:\s*#57534E/);
  assert.ok(globals.includes(".text-\\[\\#78716C\\]"));
  assert.match(globals, /color:\s*#57534E/);
  assert.doesNotMatch(globals, /placeholder[^\n]*#57534E/);
});

test("Windows 低密度屏只增强指定的工作台小标签字重", () => {
  const appShell = readSource("src/styles/components/app-shell.css");
  const dashboard = readSource("src/styles/components/dashboard.css");

  assert.match(
    appShell,
    /html\[data-os="windows"\]\[data-text-density="low"\]:not\(\.dark\) \.app-shell-kicker\s*\{[^}]*font-weight:\s*500/,
  );
  assert.match(
    dashboard,
    /html\[data-os="windows"\]\[data-text-density="low"\]:not\(\.dark\) \.dashboard-section-kicker\s*\{[^}]*font-weight:\s*500/,
  );
  assert.match(
    dashboard,
    /html\[data-os="windows"\]\[data-text-density="low"\]:not\(\.dark\) \.dashboard-metric-strip-compact \.app-shell-metric-label\s*\{[^}]*font-weight:\s*500/,
  );
});
