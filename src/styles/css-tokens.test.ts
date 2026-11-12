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

test("字号档位不使用半像素值（依赖即静默失效）", () => {
  const globals = readSource("src/app/globals.css");

  for (const value of ["9.5", "10.5", "11.5", "12.5", "13.5", "14.5"]) {
    assert.ok(!globals.includes(value), `globals.css 不应再出现半像素字号 ${value}`);
  }
});

test("字体栈先 Inter、再 MiSans、最后系统字体，中文衬线仍钉死中易宋体", () => {
  const globals = readSource("src/app/globals.css");

  // 自托管字体在前，系统字体全部保留在后：字体没下完或下载失败时与旧版一致
  assert.match(
    globals,
    /--font-sans:\s*var\(--font-inter\),\s*var\(--font-misans\),\s*-apple-system,\s*BlinkMacSystemFont,\s*'Segoe UI',\s*'PingFang SC',\s*'Microsoft YaHei UI',\s*'Microsoft YaHei',\s*system-ui,\s*sans-serif;/,
  );
  assert.match(
    globals,
    /--font-serif:\s*"Iowan Old Style", Charter, Georgia, "Songti SC", SimSun, serif;/,
  );
  // STSong 随 Office 才命中、NSimSun 观感漂移：中文衬线一律落中易宋体（规范 §1.6）
  assert.doesNotMatch(globals, /STSong|NSimSun/);
  assert.doesNotMatch(globals, /--font-display/);
  assert.doesNotMatch(globals, /fonts\.googleapis|fonts\.gstatic/);
  assert.doesNotMatch(globals, /placeholder[^\n]*#78716C/);
});

test("两款字体自托管在 src/fonts（内容哈希 + 一年缓存），Inter 只认英文数字与英文标点", () => {
  const layout = readSource("src/app/layout.tsx");

  assert.match(layout, /from "next\/font\/local"/);
  // 必须放 src/fonts 让 next/font 生成内容哈希文件名；放 public/ 拿不到 immutable 缓存
  assert.match(layout, /\.\.\/fonts\/Inter-Variable\.woff2/);
  assert.match(layout, /\.\.\/fonts\/MiSans-Variable\.woff2/);
  // 只裁到 400–600 三档
  assert.equal((layout.match(/weight: "400 600"/g) ?? []).length, 2);
  // 中文引号、省略号、破折号不归 Inter，交给 MiSans
  assert.match(layout, /prop: "unicode-range",\s*value: "U\+0020-007E, U\+00A0"/);
  assert.equal((layout.match(/display: "swap"/g) ?? []).length, 2);
});

test("弹层关闭后残留遮罩不再吞点击：只用 [inert] 态关闭指针，不误伤打开态", () => {
  const globals = readSource("src/app/globals.css");

  // 必须存在针对 Base UI 内部遮罩的兜底规则（2026-10-11 审计：关掉筛选后点不动别的控件）
  assert.match(
    globals,
    /\[data-base-ui-inert\]\[inert\]\s*\{[^}]*pointer-events:\s*none/,
    "缺少弹层遮罩的 pointer-events 兜底；关闭后残留层会继续拦截整页点击",
  );

  // 关键区分：库把 data-base-ui-inert 作为静态标记挂在任何状态上，
  // 只有 [inert] 才是「已关闭」。若只用前者，会把打开态的「点外面关闭」一起废掉。
  assert.doesNotMatch(
    globals,
    /\[data-base-ui-inert\]\s*\{[^}]*pointer-events:\s*none/,
    "选择器缺少 [inert] 限定：遮罩在打开态也会失去指针事件，点外部无法关闭弹层",
  );
});
