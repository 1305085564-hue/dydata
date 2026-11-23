#!/usr/bin/env node
// 单元测试入口（npm test）：不依赖任何外部服务，任何环境下都必须全绿。
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import process from "node:process";

const mode = process.argv[2] ?? "unit";
const scriptTests = globSync(["scripts/**/*.test.{js,mjs,ts,tsx}"]).map((file) => file.split("\\").join("/")).sort();

const srcTests = globSync(["src/**/*.test.{ts,tsx,js,mjs}"]).map((file) => file.split("\\").join("/")).sort();
// node --test 把参数当通配符解析：路径里的 [id] 会被当成字符集，文件被静默漏跑（假绿）。
// 把方括号转义成只匹配字面字符的形式。
const literal = (file) => file.replace(/[[\]]/g, (char) => `[${char}]`);

function runTsx(files, extraArgs = [], env = process.env) {
  if (files.length === 0) {
    console.error(`[run-tests] ${mode}: 没有找到测试文件`);
    process.exit(1);
  }
  const child = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--test", ...extraArgs, ...files.map(literal)], { stdio: "inherit", env });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

if (mode === "unit") {
  runTsx([...srcTests, ...scriptTests]);
} else {
  console.error(`[run-tests] 未知模式：${mode}（仅支持 unit）`);
  process.exit(1);
}
