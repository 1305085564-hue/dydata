import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const gateSource = await readFile(path.join(root, "scripts/maintainability-gate.mjs"), "utf8");

async function createFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), "maintainability-gate-"));
  await mkdir(path.join(fixture, "scripts"), { recursive: true });
  await mkdir(path.join(fixture, "src"), { recursive: true });
  await writeFile(path.join(fixture, "scripts/maintainability-gate.mjs"), gateSource);
  await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\n");
  await runGit(fixture, ["init", "-q"]);
  await runGit(fixture, ["config", "user.email", "gate@test.invalid"]);
  await runGit(fixture, ["config", "user.name", "maintainability gate"]);
  await runGit(fixture, ["add", "scripts/maintainability-gate.mjs", "src/sample.ts"]);
  await runGit(fixture, ["commit", "-qm", "fixture"]);
  return fixture;
}

async function runGit(cwd, args) {
  const result = await run("git", args, cwd);
  if (result.code !== 0) throw new Error(result.stderr || `git exit ${result.code}`);
}

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function runGate(fixture) {
  return run(process.execPath, [path.join(fixture, "scripts/maintainability-gate.mjs")], fixture);
}

async function assertBlocked(fixture, message) {
  const result = await runGate(fixture);
  assert.equal(result.code, 1, `${message}: ${result.stderr || result.stdout}`);
  assert.match(result.stderr, /unbounded-cache-candidate/);
}

test("clean fixture passes, unstaged and staged tracked additions block", async () => {
  const fixture = await createFixture();
  try {
    assert.equal((await runGate(fixture)).code, 0);
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\nconst cache = new Map();\n");
    await assertBlocked(fixture, "unstaged tracked file");
    await runGit(fixture, ["add", "src/sample.ts"]);
    await assertBlocked(fixture, "staged tracked file");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("unstaged and staged new raw Map files block", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "new-file.ts"), "export const cache = new Map();\n");
    await assertBlocked(fixture, "unstaged new file");
    await runGit(fixture, ["add", "src/new-file.ts"]);
    await assertBlocked(fixture, "staged new file");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
