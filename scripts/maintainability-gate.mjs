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
const rawMapPattern = /new\s+Map\s*[<(]/;
const typeCheckNotice = "本门禁不含类型检查（因为构建配置忽略类型错误，绿灯不代表能编译）";

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

async function git(args) {
  try {
    const result = await execFileAsync("git", args, { cwd: root });
    return result.stdout;
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || "unknown git error").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

function parseBaseArg(args) {
  const inline = args.find((arg) => arg.startsWith("--base="));
  if (inline) return inline.slice("--base=".length) || "origin/main";
  const index = args.indexOf("--base");
  if (index !== -1 && args[index + 1]) return args[index + 1];
  return "origin/main";
}

function parseNameLines(output) {
  return new Set(output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
}

function parseAddedRawMapPaths(diff) {
  const paths = new Set();
  let currentPath = null;
  for (const line of diff.split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (header) currentPath = header[2];
    if (currentPath && /^\+[^+]/.test(line) && rawMapPattern.test(line.slice(1))) {
      paths.add(currentPath);
    }
  }
  return paths;
}

const args = process.argv.slice(2);
const reportMode = args.includes("--report");
const baseRef = parseBaseArg(args);
let baseCommit;
let files;
let changedPaths;
let untrackedPaths;
let addedRawMapPaths;

try {
  baseCommit = (await git(["rev-parse", "--verify", `${baseRef}^{commit}`])).trim();
  files = await walk(path.join(root, "src"));
  const [changedOutput, untrackedOutput, diff] = await Promise.all([
    git(["diff", "--name-only", baseRef, "--", "src"]),
    git(["ls-files", "--others", "--exclude-standard", "--", "src"]),
    git(["diff", "--no-renames", "--unified=0", baseRef, "--", "src"]),
  ]);
  untrackedPaths = parseNameLines(untrackedOutput);
  changedPaths = new Set([...parseNameLines(changedOutput), ...untrackedPaths]);
  addedRawMapPaths = parseAddedRawMapPaths(diff);
} catch (error) {
  console.error(`maintainability gate: ${error.message}`);
  process.exitCode = 2;
}

if (process.exitCode !== 2) {
  const allViolations = [];
  for (const file of files) {
    const relative = rel(file);
    const source = await fs.readFile(file, "utf8");
    const lines = source.split(/\r?\n/).length;
    if (lines > 1200) allViolations.push({ type: "blocking-file-size", path: relative, detail: `${lines} lines` });
    if (!allowRawMap.has(relative) && rawMapPattern.test(source) && !relative.endsWith(".test.ts") && !relative.endsWith(".test.tsx")) {
      allViolations.push({ type: "unbounded-cache-candidate", path: relative, detail: "new Map requires cache-policy review" });
    }
  }

  const isNewViolation = (item) =>
    changedPaths.has(item.path) && (
      item.type === "blocking-file-size"
      || addedRawMapPaths.has(item.path)
      || (item.type === "unbounded-cache-candidate" && untrackedPaths.has(item.path))
    );
  const violations = allViolations.filter(isNewViolation);

  const report = {
    generatedAt: new Date().toISOString(),
    baseRef,
    baseCommit,
    changedPaths: [...changedPaths].sort(),
    untrackedPaths: [...untrackedPaths].sort(),
    addedRawMapPaths: [...addedRawMapPaths].sort(),
    legacyViolations: allViolations.filter((item) => !isNewViolation(item)),
    violations,
    status: violations.length ? "blocked" : "pass",
    typeCheckNotice,
    rule: "新增缓存必须声明 TTL、容量、作用域和失效；阻断线以上文件不得继续新增业务逻辑。",
  };

  if (reportMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`maintainability gate: note: ${typeCheckNotice}`);
    if (violations.length) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
    } else {
      console.log("maintainability gate: pass");
    }
  }
}
