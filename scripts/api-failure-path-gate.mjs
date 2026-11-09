#!/usr/bin/env node
// 推送门禁：本次新增的 API 路由必须带失败路径测试。
// 范围只覆盖"新增 route.ts"，不回头要求既有接口补齐，避免一次性大面积红。
// 判定标准：同目录测试里至少有一条断言 4xx/5xx 状态码；只断言成功路径不算。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FAILURE_STATUS = /(?:\.status\s*,\s*|status\s*===?\s*)([45]\d{2})/;
const TEST_FILE = /\.test\.tsx?$/;

export function hasFailureAssertion(source) {
  return FAILURE_STATUS.test(source);
}

export function evaluateRoute(routePath, { readTestFiles, exemptions = {} }) {
  if (exemptions[routePath]) {
    return { routePath, status: "exempt", reason: exemptions[routePath] };
  }
  const tests = readTestFiles(routePath);
  if (tests.length === 0) {
    return { routePath, status: "missing", reason: "同目录没有测试文件" };
  }
  if (tests.some((source) => hasFailureAssertion(source))) {
    return { routePath, status: "pass" };
  }
  return { routePath, status: "missing", reason: "测试只覆盖成功路径，没有 4xx/5xx 断言" };
}

function readTestFilesForRoute(routePath) {
  const dir = path.dirname(routePath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => TEST_FILE.test(name))
    .map((name) => readFileSync(path.join(dir, name), "utf8"));
}

function loadExemptions() {
  const file = "scripts/api-failure-path-exemptions.json";
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`[api-failure-path] 豁免清单不是合法 JSON：${error.message}`);
    process.exit(1);
  }
}

function main() {
  const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
  const base = baseArg ? baseArg.slice("--base=".length) : "origin/main";

  let added = [];
  try {
    added = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    console.error(`[api-failure-path] ⚠️ 无法对比 ${base}，本次跳过新增接口检查`);
    process.exit(0);
  }

  const routes = added.filter((file) => file.startsWith("src/app/api/") && file.endsWith("/route.ts"));
  if (routes.length === 0) {
    console.log("✅ 新增接口失败路径检查通过（本次没有新增接口）");
    return;
  }

  const exemptions = loadExemptions();
  const results = routes.map((routePath) => evaluateRoute(routePath, { readTestFiles: readTestFilesForRoute, exemptions }));
  const failed = results.filter((item) => item.status === "missing");
  const exempted = results.filter((item) => item.status === "exempt");

  if (failed.length > 0) {
    console.error(`❌ 新增接口失败路径检查失败（${failed.length} 项待补）`);
    for (const item of failed) {
      console.error(`- ${item.routePath}：${item.reason}`);
    }
    if (exempted.length > 0) {
      console.error(`（另有 ${exempted.length} 项已登记豁免）`);
    }
    process.exit(1);
  }

  console.log(`✅ 新增接口失败路径检查通过（新增 ${routes.length} 个接口，均有失败路径测试）`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
