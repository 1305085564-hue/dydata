import { spawnSync } from "node:child_process";
import { assertGateEnvironment } from "./assert-local-gate-env.mjs";
import { assertGateRevisionUnchanged, lockGateRevision } from "./gate-lock.mjs";
import { createGateCommandRunner, runCloudBaseGate } from "./cloudbase-gate-lifecycle.mjs";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const gateArguments = process.argv.slice(2);
const b05Only = gateArguments.length === 1 && gateArguments[0] === "--b05-only";
if (gateArguments.length && !b05Only) throw new Error("角色门禁仅支持 --b05-only 定向参数");
if (b05Only && process.env.DYDATA_GATE_BACKEND !== "cloudbase") throw new Error("B05 仅用于 CloudBase 隔离环境");
let lockedRevision;
try {
  assertGateEnvironment();
  lockedRevision = lockGateRevision();
} catch (error) {
  console.error(`[gate-roles] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

let exitCode = 1;
if (process.env.DYDATA_GATE_BACKEND === "cloudbase") {
  const runner = createGateCommandRunner();
  try { exitCode = await runCloudBaseGate({ kind: "roles", scope: b05Only ? "b05" : "full", run: runner.run }); }
  catch (error) { console.error(`[gate-roles] ${error instanceof Error ? error.message : error}`); }
  finally { runner.dispose(); }
} else {
  exitCode = run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/seed-roles-test-data.ts"]);
  if (exitCode === 0) exitCode = run(process.execPath, ["node_modules/next/dist/bin/next", "build"]);
  if (exitCode === 0) exitCode = run(process.execPath, [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "playwright.role.config.ts",
  ]);
}

try {
  assertGateRevisionUnchanged(lockedRevision);
} catch (error) {
  console.error(`[gate-roles] ${error instanceof Error ? error.message : error}`);
  exitCode = 2;
}
process.exitCode = exitCode;
