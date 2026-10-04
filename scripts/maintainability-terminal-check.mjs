#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const baseArgs = process.argv.slice(2).filter((arg) => arg !== "--json");
const result = spawnSync(process.execPath, ["scripts/maintainability-gate.mjs", "--report", ...baseArgs], {
  cwd: process.cwd(),
  encoding: "utf8",
});

if (result.error) throw result.error;
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr || result.stdout || "维护性门禁没有输出 JSON\n");
  process.exit(result.status ?? 2);
}

const terminal = {
  status: report.status,
  terminalClear: report.violations.length === 0,
  unapprovedViolations: report.violations.length,
  registeredLegacyDebt: report.legacyViolations.length,
  baseRef: report.baseRef,
  baseCommit: report.baseCommit,
  evidence: "scripts/maintainability-gate.mjs --report",
};
console.log(JSON.stringify(terminal, null, 2));
if (!terminal.terminalClear) process.exitCode = 1;
