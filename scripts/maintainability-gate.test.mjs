import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const gateSource = await readFile(path.join(root, "scripts/maintainability-gate.mjs"), "utf8");

async function createFixture() {
  const fixture = await mkdtemp(path.join(root, ".tmp-maintainability-gate-"));
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

test("clean fixture passes, tracked raw Map addition blocks", async () => {
  const fixture = await createFixture();
  try {
    assert.equal((await runGate(fixture)).code, 0);
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\nconst cache = new Map();\n");
    const result = await runGate(fixture);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("untracked raw Map addition blocks", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "new-file.ts"), "export const cache = new Map();\n");
    const result = await runGate(fixture);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /new-file\.ts/);
    assert.match(result.stderr, /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
