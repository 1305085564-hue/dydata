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
  return result.stdout.trim();
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

async function runGate(fixture, base = "HEAD") {
  const args = [path.join(fixture, "scripts/maintainability-gate.mjs")];
  if (base) args.push(`--base=${base}`);
  return run(process.execPath, args, fixture);
}

async function assertBlocked(fixture, message, pattern = /unbounded-cache-candidate/) {
  const result = await runGate(fixture);
  assert.equal(result.code, 1, `${message}: ${result.stderr || result.stdout}`);
  assert.match(result.stderr, pattern);
  assert.match(result.stdout, /本门禁不含类型检查/);
}

test("clean checkout compares against base: committed new file blocks, removal passes", async () => {
  const fixture = await createFixture();
  try {
    const base = await runGit(fixture, ["rev-parse", "HEAD"]);
    await runGit(fixture, ["update-ref", "refs/remotes/origin/main", base]);
    const defaultBase = await runGate(fixture, null);
    assert.equal(defaultBase.code, 0, defaultBase.stderr || defaultBase.stdout);
    await writeFile(path.join(fixture, "src", "branch-cache.ts"), "export const cache = new Map<string, string>();\n");
    await runGit(fixture, ["add", "src/branch-cache.ts"]);
    await runGit(fixture, ["commit", "-qm", "branch cache"]);

    const blocked = await runGate(fixture, base);
    assert.equal(blocked.code, 1, blocked.stderr || blocked.stdout);
    assert.match(blocked.stderr, /unbounded-cache-candidate/);
    assert.match(blocked.stderr, /src\/branch-cache\.ts/);

    await runGit(fixture, ["rm", "-q", "src/branch-cache.ts"]);
    await runGit(fixture, ["commit", "-qm", "remove branch cache"]);
    const clean = await runGate(fixture, base);
    assert.equal(clean.code, 0, clean.stderr || clean.stdout);
    assert.match(clean.stdout, /maintainability gate: pass/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("clean baseline keeps legacy large file visible but a changed large file blocks", async () => {
  const fixture = await createFixture();
  try {
    const large = `${Array.from({ length: 1200 }, (_, index) => `export const line${index} = ${index};`).join("\n")}\n`;
    await writeFile(path.join(fixture, "src", "legacy-large.ts"), large);
    await runGit(fixture, ["add", "src/legacy-large.ts"]);
    await runGit(fixture, ["commit", "-qm", "legacy large file"]);
    const base = await runGit(fixture, ["rev-parse", "HEAD"]);
    assert.equal((await runGate(fixture, base)).code, 0);

    await writeFile(path.join(fixture, "src", "legacy-large.ts"), `${large}export const added = true;\n`);
    await assertBlocked(fixture, "changed large file", /blocking-file-size/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("tracked raw Map changes block in unstaged and staged states", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\nconst cache = new Map();\n");
    await assertBlocked(fixture, "unstaged tracked file");
    await runGit(fixture, ["add", "src/sample.ts"]);
    await assertBlocked(fixture, "staged tracked file");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("new raw Map files block in untracked and staged states", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "new-file.ts"), "export const cache = new Map();\n");
    await assertBlocked(fixture, "untracked new file");
    await runGit(fixture, ["add", "src/new-file.ts"]);
    await assertBlocked(fixture, "staged new file");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
