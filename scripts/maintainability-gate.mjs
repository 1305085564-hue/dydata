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
const rawMapPattern = /new\s+(?:globalThis\.)?Map\s*[<(]/;
const rawMapMatchPattern = /new\s+(?:globalThis\.)?Map\s*[<(]/g;
const typeCheckNotice = "本门禁不含类型检查（因为构建配置忽略类型错误，绿灯不代表能编译）";
const baselinePath = "scripts/maintainability-baseline.json";
const blockingLineLimit = 1000;
const activityLineLimit = 600;
const activityChangeLimit = 45;
const routeShrinkLineLimit = 800;
const baselineLineLimit = 500;

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

async function gitShow(ref, file) {
  try {
    return await git(["show", `${ref}:${file}`]);
  } catch {
    return null;
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

function hasTransientMapMarker(line) {
  const marker = line.match(/\/\/\s*gate:transient-map\s+(.+?)\s*$/);
  return Boolean(marker?.[1]?.trim());
}

function findRawMapMatches(source) {
  const lines = source.split(/\r?\n/);
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    rawMapMatchPattern.lastIndex = 0;
    let match = rawMapMatchPattern.exec(line);
    while (match) {
      const sameLineMarker = hasTransientMapMarker(line.slice(match.index + match[0].length));
      const previousLineMarker = index > 0 && hasTransientMapMarker(lines[index - 1]);
      matches.push({ line: index + 1, exempt: sameLineMarker || previousLineMarker });
      match = rawMapMatchPattern.exec(line);
    }
  }
  return matches;
}

function classifyPath(relative, source) {
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(relative)) return "test";
  if (/\.d\.ts$|(^|\/)(types?|type-definitions?)(\/|[._-])/i.test(relative)) return "type";
  if (/(^|\/)(__generated__|generated)(\/|[._-])/i.test(relative) || /^\s*\/\/\s*@generated\b/m.test(source)) return "generated";
  return "source";
}

function parseActivity(output) {
  const commits = new Map();
  let commit = null;
  for (const line of output.split(/\r?\n/)) {
    const marker = line.match(/^__commit__([0-9a-f]+)$/);
    if (marker) {
      commit = marker[1];
      continue;
    }
    const file = line.trim();
    if (!commit || !file) continue;
    if (!commits.has(file)) commits.set(file, new Set());
    commits.get(file).add(commit);
  }
  return new Map([...commits].map(([file, hashes]) => [file, hashes.size]));
}

function lineCount(source) {
  return source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
}

function baselineValue(entry) {
  if (typeof entry === "number") return entry;
  if (!entry || typeof entry !== "object") return null;
  if (Number.isInteger(entry.maxLines)) return entry.maxLines;
  if (Number.isInteger(entry.lines)) return entry.lines;
  return null;
}

function parseBaseline(raw, label) {
  if (raw === null) return { version: 1, files: {}, missing: true };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.files || typeof parsed.files !== "object") {
      throw new Error("files must be an object");
    }
    return { version: parsed.version ?? 1, files: parsed.files, missing: false, label };
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function sortedRecords(records) {
  return records.sort((a, b) => a.path.localeCompare(b.path));
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
  const [changedOutput, untrackedOutput, diff, activityOutput, currentBaselineRaw, baseBaselineRaw] = await Promise.all([
    git(["diff", "--name-only", baseRef, "--", "src"]),
    git(["ls-files", "--others", "--exclude-standard", "--", "src"]),
    git(["diff", "--no-renames", "--unified=0", baseRef, "--", "src"]),
    git(["log", "--since=90 days ago", "--format=__commit__%H", "--name-only", "--", "src"]),
    fs.readFile(path.join(root, baselinePath), "utf8").catch(() => null),
    gitShow(baseRef, baselinePath),
  ]);
  untrackedPaths = parseNameLines(untrackedOutput);
  changedPaths = new Set([...parseNameLines(changedOutput), ...untrackedPaths]);
  addedRawMapPaths = parseAddedRawMapPaths(diff);
  globalThis.maintainabilityContext = {
    activity: parseActivity(activityOutput),
    currentBaseline: parseBaseline(currentBaselineRaw, baselinePath),
    baseBaseline: parseBaseline(baseBaselineRaw, `${baseRef}:${baselinePath}`),
  };
} catch (error) {
  console.error(`maintainability gate: ${error.message}`);
  process.exitCode = 2;
}

if (process.exitCode !== 2) {
  const context = globalThis.maintainabilityContext;
  const baseLineCache = new Map();
  const baseLineCount = async (relative) => {
    if (baseLineCache.has(relative)) return baseLineCache.get(relative);
    const source = await gitShow(baseRef, relative);
    const count = source === null ? 0 : lineCount(source);
    baseLineCache.set(relative, count);
    return count;
  };

  const records = [];
  for (const file of files) {
    const relative = rel(file);
    const source = await fs.readFile(file, "utf8");
    records.push({
      path: relative,
      lines: lineCount(source),
      category: classifyPath(relative, source),
      changes90d: context.activity.get(relative) ?? 0,
      rawMap: findRawMapMatches(source),
      source,
    });
  }

  const splitList = sortedRecords(records
    .filter((item) => item.category === "source" && (item.lines > blockingLineLimit || (item.lines > activityLineLimit && item.changes90d >= activityChangeLimit)))
    .map((item) => ({
      path: item.path,
      lines: item.lines,
      changes90d: item.changes90d,
      rule: item.lines > blockingLineLimit ? "line-count" : "activity",
    })));
  const splitPaths = new Set(splitList.map((item) => item.path));
  const allViolations = [];

  for (const item of records) {
    const needsBaseLines = changedPaths.has(item.path)
      || item.lines > routeShrinkLineLimit
      || item.lines > baselineLineLimit;
    const baseLines = needsBaseLines ? await baseLineCount(item.path) : null;
    const oldFile = baseLines !== null && baseLines > 0;
    if (item.lines > blockingLineLimit) {
      allViolations.push({ type: "blocking-file-size", path: item.path, category: item.category, detail: `${item.lines} lines > ${blockingLineLimit}` });
    }
    const unmarkedRawMap = item.rawMap.filter((match) => !match.exempt);
    if (!allowRawMap.has(item.path) && unmarkedRawMap.length > 0 && !/(\.test|\.spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(item.path) && (addedRawMapPaths.has(item.path) || untrackedPaths.has(item.path))) {
      allViolations.push({ type: "unbounded-cache-candidate", path: item.path, category: item.category, detail: "new Map requires cache-policy review" });
    }
    if (oldFile && item.category === "source" && item.lines > routeShrinkLineLimit && !splitPaths.has(item.path) && item.lines >= baseLines) {
      allViolations.push({ type: "route-must-shrink", path: item.path, category: item.category, detail: `${baseLines} -> ${item.lines} lines; > ${routeShrinkLineLimit} line legacy file must shrink` });
    }
    if (oldFile && item.lines > baselineLineLimit && !splitPaths.has(item.path)) {
      const currentCap = baselineValue(context.currentBaseline.files[item.path]);
      const baseCap = baselineValue(context.baseBaseline.files[item.path]);
      const cap = currentCap === null ? baseCap : (baseCap === null ? currentCap : Math.min(currentCap, baseCap));
      if (cap === null) {
        allViolations.push({ type: "missing-baseline", path: item.path, category: item.category, detail: `old file > ${baselineLineLimit} lines has no ratchet entry` });
      } else if (item.lines > cap) {
        allViolations.push({ type: "baseline-ratchet-increase", path: item.path, category: item.category, detail: `${cap} -> ${item.lines} lines; baseline only allows shrinkage` });
      }
    }
  }

  const baselineFileViolations = [];
  for (const [file, entry] of Object.entries(context.currentBaseline.files)) {
    const currentValue = baselineValue(entry);
    const baseValue = baselineValue(context.baseBaseline.files[file]);
    if (currentValue !== null && baseValue !== null && currentValue > baseValue) {
      baselineFileViolations.push({ type: "baseline-file-increase", path: file, detail: `${baseValue} -> ${currentValue}; baseline may only decrease` });
    }
  }
  allViolations.push(...baselineFileViolations);

  const isNewViolation = (item) => {
    if (item.type === "baseline-file-increase" || item.type === "baseline-ratchet-increase" || item.type === "missing-baseline") return true;
    return changedPaths.has(item.path) && (
      item.type === "blocking-file-size"
      || item.type === "route-must-shrink"
      || item.type === "unbounded-cache-candidate"
    );
  };
  const violations = allViolations.filter(isNewViolation);
  const categories = Object.fromEntries(["source", "test", "type", "generated"].map((category) => [
    category,
    sortedRecords(records.filter((item) => item.category === category).map(({ path: file, lines, changes90d }) => ({ path: file, lines, changes90d }))),
  ]));
  const report = {
    generatedAt: new Date().toISOString(),
    baseRef,
    baseCommit,
    thresholds: {
      blockingLines: blockingLineLimit,
      activityLines: activityLineLimit,
      activityChanges90d: activityChangeLimit,
      routeShrinkLines: routeShrinkLineLimit,
      baselineLines: baselineLineLimit,
    },
    splitList,
    categories,
    changedPaths: [...changedPaths].sort(),
    untrackedPaths: [...untrackedPaths].sort(),
    addedRawMapPaths: [...addedRawMapPaths].sort(),
    baselinePath,
    baselineEntries: Object.keys(context.currentBaseline.files).sort(),
    legacyViolations: allViolations.filter((item) => !isNewViolation(item)),
    violations,
    status: violations.length ? "blocked" : "pass",
    typeCheckNotice,
    rule: "新增缓存必须声明 TTL、容量、作用域和失效；阻断线以上文件不得继续新增业务逻辑；名单外老文件只能按棘轮下降。",
  };

  if (reportMode) {
    console.log(JSON.stringify(report, null, 2));
    if (violations.length) process.exitCode = 1;
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
