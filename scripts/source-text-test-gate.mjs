#!/usr/bin/env node
// 源码文字匹配测试门禁：禁止新增读取 .ts/.tsx 源码做文字匹配的测试，存量只准减不准增。
import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const BASELINE_PATH = "scripts/source-text-test-baseline.json";
export const REJECTION_GUIDANCE =
  "请改成测功能（调函数或渲染组件）；确实是全仓规则扫描（比如接口鉴权清点）的，在交付报告里申请，由复验方登记";

const FILE_READ_PATTERN = /\b(?:readFileSync|readFile)\s*\(/;
const TS_SOURCE_EXT_PATTERN = /\.(?:ts|tsx)\b/;
const MATCH_ASSERTION_PATTERN = /\bassert\.(?:match|doesNotMatch)\s*\(/g;
const STRING_CHECK_ASSERTION_PATTERN = /\bassert\.(?:ok|equal|strictEqual)\s*\([^;\n]*(?:\.includes|\.test)\s*\(/g;

export function isSourceReadingTest(source) {
  return FILE_READ_PATTERN.test(source) && TS_SOURCE_EXT_PATTERN.test(source);
}

export function countSourceTextAssertions(source) {
  const matchCount = (source.match(MATCH_ASSERTION_PATTERN) ?? []).length;
  const checkCount = (source.match(STRING_CHECK_ASSERTION_PATTERN) ?? []).length;
  return matchCount + checkCount;
}

export function scanSourceTextTests(root = process.cwd()) {
  const testFiles = globSync(["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "scripts/**/*.test.tsx"], {
    cwd: root,
    exclude: ["**/node_modules/**", "**/.next/**", "**/.git/**", "**/output/**"],
  })
    .map((file) => file.split(path.sep).join("/"))
    .sort();

  const findings = {};
  for (const relativePath of testFiles) {
    const source = readFileSync(path.join(root, relativePath), "utf8");
    if (!isSourceReadingTest(source)) continue;
    findings[relativePath] = countSourceTextAssertions(source);
  }
  return findings;
}

export function evaluateSourceTextTests(findings, baselineFiles) {
  const violations = [];
  for (const [file, count] of Object.entries(findings)) {
    if (!Object.hasOwn(baselineFiles, file)) {
      violations.push({
        type: "new-source-text-test",
        file,
        actual: count,
        limit: 0,
        detail: `新增读取 .ts/.tsx 源码的测试文件（匹配源码文字断言 ${count} 条）`,
      });
      continue;
    }
    const limit = baselineFiles[file];
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0) {
      violations.push({
        type: "invalid-baseline-entry",
        file,
        actual: count,
        limit,
        detail: `基线条目非法：${String(limit)}`,
      });
      continue;
    }
    if (count > limit) {
      violations.push({
        type: "assertion-count-increased",
        file,
        actual: count,
        limit,
        detail: `匹配源码文字的断言条数增加（${limit} -> ${count}）`,
      });
    }
  }
  return violations;
}

export function runSourceTextTestGate(root = process.cwd(), baselineRelPath = BASELINE_PATH) {
  const baselineFile = path.resolve(root, baselineRelPath);
  if (!existsSync(baselineFile)) {
    return {
      ok: false,
      error: `缺少基线清单：${baselineRelPath}`,
      findings: {},
      violations: [],
    };
  }
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  } catch (error) {
    return {
      ok: false,
      error: `基线清单不是合法 JSON：${error.message}`,
      findings: {},
      violations: [],
    };
  }
  if (!baseline || typeof baseline !== "object" || !baseline.files || typeof baseline.files !== "object") {
    return {
      ok: false,
      error: `基线清单缺少 files 对象：${baselineRelPath}`,
      findings: {},
      violations: [],
    };
  }

  const findings = scanSourceTextTests(root);
  const violations = evaluateSourceTextTests(findings, baseline.files);
  return {
    ok: violations.length === 0,
    findings,
    violations,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = runSourceTextTestGate(process.cwd());
  if (result.error) {
    console.error(`[source-text-test-gate] ${result.error}`);
    process.exit(1);
  }
  const fileCount = Object.keys(result.findings).length;
  const totalAssertions = Object.values(result.findings).reduce((sum, count) => sum + count, 0);
  if (!result.ok) {
    console.error(`❌ 源码文字测试门禁失败（发现 ${result.violations.length} 项违规）：`);
    for (const item of result.violations) {
      console.error(`- ${item.file}：${item.detail}`);
    }
    console.error(REJECTION_GUIDANCE);
    process.exit(1);
  }
  console.log(`✅ 源码文字测试门禁通过（存量 ${fileCount} 个文件，共 ${totalAssertions} 条断言，无新增或增长）`);
}
