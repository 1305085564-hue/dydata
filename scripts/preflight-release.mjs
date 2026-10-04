#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const baseUrl = process.env.BASE_URL?.trim();

const scriptTests = readdirSync(path.join(root, "scripts"))
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => path.join("scripts", file));
const steps = [
  { id: "migration-scope", command: "git diff --name-only -- supabase/migrations", args: [] },
  { id: "scripts-tests", command: `node --test ${scriptTests.join(" ")}`, args: ["--test", ...scriptTests] },
  { id: "unit-tests", command: "npm test", args: ["test"] },
  { id: "typecheck", command: "npx tsc --noEmit --pretty false", args: ["tsc", "--noEmit", "--pretty", "false"] },
  { id: "lint", command: "npm run lint", args: ["run", "lint"] },
  { id: "build", command: "npm run build", args: ["run", "build"] },
  { id: "maintainability", command: "node scripts/maintainability-terminal-check.mjs", args: ["scripts/maintainability-terminal-check.mjs"] },
  { id: "roles", command: "npm run gate:roles", args: ["run", "gate:roles"] },
  { id: "browser", command: "npm run gate:browser", args: ["run", "gate:browser"] },
  { id: "architecture-baseline", command: "node scripts/architecture-baseline.mjs --report", args: ["scripts/architecture-baseline.mjs", "--report"] },
  { id: "runtime-smoke", command: "npm run smoke:runtime", args: ["run", "smoke:runtime"] },
];

function runStep(step) {
  if (step.id === "migration-scope") {
    const tracked = spawnSync("git", ["diff", "--name-only", "--", "supabase/migrations"], { cwd: root, encoding: "utf8" });
    const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "--", "supabase/migrations"], { cwd: root, encoding: "utf8" });
    const changed = `${tracked.stdout ?? ""}${untracked.stdout ?? ""}`.trim();
    if (changed) throw new Error(`本批禁止修改 supabase/migrations/**：${changed}`);
    console.log("[preflight] migration scope clean");
    return 0;
  }
  const command = step.command.startsWith("npx ") ? "npx" : step.command.startsWith("node ") ? process.execPath : npmCommand;
  const args = step.args;
  const env = step.id === "runtime-smoke" && baseUrl ? { ...process.env, BASE_URL: baseUrl } : process.env;
  const child = spawnSync(command, args, { cwd: root, stdio: "inherit", env, shell: false });
  if (child.error) throw child.error;
  return child.status ?? 1;
}

if (dryRun) {
  console.log(JSON.stringify({ mode: "dry-run", steps }, null, 2));
  process.exit(0);
}

if (!existsSync(path.join(root, "package.json"))) throw new Error("必须在仓库根目录运行预发布检查");
if (process.env.DYDATA_E2E_BASE_URL) {
  throw new Error("预发布角色/浏览器检查只允许本地隔离库；外部预览请单独运行只读 smoke，不得让 gate:roles 写入外部环境");
}

const results = [];
for (const step of steps) {
  const startedAt = Date.now();
  console.log(`\n[preflight] ${step.id}: ${step.command}`);
  const code = runStep(step);
  results.push({ id: step.id, command: step.command, exitCode: code, durationMs: Date.now() - startedAt });
  if (code !== 0) {
    console.error(JSON.stringify({ status: "blocked", failedStep: step.id, results }, null, 2));
    process.exit(code);
  }
}

console.log(JSON.stringify({ status: "pass", results, source: readFileSync(path.join(root, "package.json"), "utf8").includes("gate:roles") ? "package.json" : "missing" }, null, 2));
