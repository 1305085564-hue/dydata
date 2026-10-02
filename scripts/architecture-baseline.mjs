#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourceRoots = ["src", "scripts"];
const ignored = new Set(["node_modules", ".next", ".git", "output"]);
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (extensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function relative(file) { return path.relative(repoRoot, file).split(path.sep).join("/"); }
function countMatches(source, pattern) { return [...source.matchAll(pattern)].length; }

function summarizeFile(file, source) {
  return {
    path: relative(file),
    lines: source.split(/\r?\n/).length,
    exports: countMatches(source, /^\s*export\s+(?:async\s+)?(?:function|const|class|type|interface)/gm),
    functions: countMatches(source, /\b(?:async\s+)?function\s+[A-Za-z0-9_$]+|\b[A-Za-z0-9_$]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g),
    hasTryCatch: /\btry\s*\{[\s\S]*?\}\s*catch\s*\(/m.test(source),
    emptyCatch: countMatches(source, /catch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*\s*)?\}/g),
    cacheCandidates: countMatches(source, /new\s+Map\s*[<(]|\b(?:const|let)\s+\w+Cache\s*=\s*\{/g),
  };
}

async function buildBaseline() {
  const files = (await Promise.all(sourceRoots.map((root) => walk(path.join(repoRoot, root))))).flat().sort();
  const contents = await Promise.all(files.map(async (file) => ({ file, source: await fs.readFile(file, "utf8") })));
  const summaries = contents.map(({ file, source }) => summarizeFile(file, source));
  const allSource = contents.map(({ source }) => source).join("\n");
  const routeFiles = summaries.filter((item) => item.path.includes("/api/") && item.path.endsWith("route.ts"));
  const testFiles = summaries.filter((item) => /(?:^|\.)test\.(?:ts|tsx|mjs)$/.test(item.path));
  const largestFiles = [...summaries].sort((a, b) => b.lines - a.lines).slice(0, 20);
  const sourceByPath = new Map(contents.map(({ file, source }) => [relative(file), source]));
  const baselineDate = process.env.BASELINE_DATE ?? new Date().toISOString().slice(0, 10);

  return {
    schemaVersion: 1,
    baselineDate,
    generatedAt: new Date().toISOString(),
    repository: path.basename(repoRoot),
    source: { roots: sourceRoots, files: summaries.length, lines: summaries.reduce((sum, item) => sum + item.lines, 0) },
    structure: {
      largestFiles,
      filesOver800Lines: summaries.filter((item) => item.lines > 800).map((item) => item.path),
      filesOver1000Lines: summaries.filter((item) => item.lines > 1000).map((item) => item.path),
      totalExports: summaries.reduce((sum, item) => sum + item.exports, 0),
      totalFunctions: summaries.reduce((sum, item) => sum + item.functions, 0),
    },
    api: {
      routeFiles: routeFiles.length,
      routesWithTryCatch: routeFiles.filter((item) => item.hasTryCatch).length,
      routesWithEmptyCatch: routeFiles.filter((item) => item.emptyCatch > 0).map((item) => ({ path: item.path, count: item.emptyCatch })),
      routeErrorHandlingCoverage: routeFiles.length ? Number((routeFiles.filter((item) => item.hasTryCatch).length / routeFiles.length).toFixed(3)) : 1,
    },
    coupling: {
      visibleUserIdsFiles: summaries.filter((item) => /visibleUserIds/.test(item.path) || /visibleUserIds/.test(sourceByPath.get(item.path) ?? "")).map((item) => item.path),
      visibleUserIdsOccurrences: countMatches(allSource, /\b(?:active)?VisibleUserIds\b/g),
      dailyReportsOccurrences: countMatches(allSource, /\bdaily_reports\b/g),
    },
    caches: {
      candidateFiles: summaries.filter((item) => item.cacheCandidates > 0).map((item) => ({ path: item.path, candidates: item.cacheCandidates })),
      candidates: summaries.reduce((sum, item) => sum + item.cacheCandidates, 0),
    },
    tests: { files: testFiles.length, paths: testFiles.map((item) => item.path) },
    runtime: {
      pageBudgets: {
        "/dashboard": { firstScreenMs: 2000, fullLoadMs: 3000, firstScreenRequests: 15 },
        "/admin/content": { firstScreenMs: 2500, fullLoadMs: 5000, firstScreenRequests: 20 },
        "other-authenticated-pages": { firstScreenMs: 2500, fullLoadMs: 4000, firstScreenRequests: 20 },
      },
      measurements: [],
      note: "运行时 P95、查询数、缓存命中率和连接池数据由 observeOperation 接入点追加；本次静态基线不伪造线上数字。",
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    `# 架构基线报告（${result.baselineDate}）`,
    "",
    `生成时间：${result.generatedAt}`,
    "",
    "## 总览",
    "",
    `- 扫描文件：${result.source.files}`,
    `- 总行数：${result.source.lines}`,
    `- 导出数：${result.structure.totalExports}`,
    `- 函数数：${result.structure.totalFunctions}`,
    `- API route：${result.api.routeFiles}`,
    `- 测试文件：${result.tests.files}`,
    "",
    "## 结构风险",
    "",
    "| 文件 | 行数 | 导出 | 函数 |",
    "|---|---:|---:|---:|",
    ...result.structure.largestFiles.slice(0, 10).map((item) => `| ${item.path} | ${item.lines} | ${item.exports} | ${item.functions} |`),
    "",
    "## API 与耦合",
    "",
    `- route 错误处理覆盖率（静态 try/catch）：${(result.api.routeErrorHandlingCoverage * 100).toFixed(1)}%`,
    `- 空 catch route：${result.api.routesWithEmptyCatch.length}`,
    `- visibleUserIds 文本出现次数：${result.coupling.visibleUserIdsOccurrences}`,
    `- daily_reports 文本出现次数：${result.coupling.dailyReportsOccurrences}`,
    `- 缓存候选：${result.caches.candidates}`,
    "",
    "## 页面预算（来源：docs/工程运行事实.md）",
    "",
    "| 页面 | 首屏 | 完整加载 | 首屏业务请求 |",
    "|---|---:|---:|---:|",
    ...Object.entries(result.runtime.pageBudgets).map(([page, budget]) => `| ${page} | ${budget.firstScreenMs}ms | ${budget.fullLoadMs}ms | ${budget.firstScreenRequests} |`),
    "",
    "运行时指标待通过真实请求采集，空数组表示没有伪造线上数据。",
    "",
  ];
  return lines.join("\n");
}

const result = await buildBaseline();
const outputDir = process.env.BASELINE_OUTPUT_DIR ?? path.join(repoRoot, "scripts");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "architecture-baseline.json"), `${JSON.stringify(result, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, "architecture-baseline.md"), renderMarkdown(result));
console.log(JSON.stringify({ baselineDate: result.baselineDate, files: result.source.files, lines: result.source.lines, routes: result.api.routeFiles }, null, 2));
