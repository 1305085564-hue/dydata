#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = process.cwd();
const ignored = new Set(["node_modules", ".next", ".git", "output"]);
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const allowRawMap = new Set([
  "src/lib/cache-policy.ts",
  "src/lib/in-flight-request.ts",
  "src/app/(app)/admin/collaboration/person-data.ts",
]);
const execFileAsync = promisify(execFile);

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

function rel(file) { return path.relative(root, file).split(path.sep).join("/"); }

const files = await walk(path.join(root, "src"));
let changedPaths = new Set();
try {
  const [tracked, untracked] = await Promise.all([
    execFileAsync("git", ["diff", "--name-only"], { cwd: root }),
    execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root }),
  ]);
  changedPaths = new Set(`${tracked.stdout}\n${untracked.stdout}`.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
} catch {
  changedPaths = new Set(files.map(rel));
}

const allViolations = [];
for (const file of files) {
  const relative = rel(file);
  const source = await fs.readFile(file, "utf8");
  const lines = source.split(/\r?\n/).length;
  if (lines > 1200) allViolations.push({ type: "blocking-file-size", path: relative, detail: `${lines} lines` });
  if (!allowRawMap.has(relative) && /new\s+Map\s*[<(]/.test(source) && !relative.endsWith(".test.ts") && !relative.endsWith(".test.tsx")) {
    allViolations.push({ type: "unbounded-cache-candidate", path: relative, detail: "new Map requires cache-policy review" });
  }
}

const violations = allViolations.filter((item) => changedPaths.has(item.path));

const report = {
  generatedAt: new Date().toISOString(),
  changedPaths: [...changedPaths].sort(),
  legacyViolations: allViolations.filter((item) => !changedPaths.has(item.path)),
  violations,
  status: violations.length ? "blocked" : "pass",
  rule: "新增缓存必须声明 TTL、容量、作用域和失效；阻断线以上文件不得继续新增业务逻辑。",
};
if (process.argv.includes("--report")) console.log(JSON.stringify(report, null, 2));
if (violations.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  console.log("maintainability gate: pass");
}
