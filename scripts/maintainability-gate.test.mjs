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

async function writeLines(file, count, firstLine = "export const value = 1;") {
  await writeFile(file, `${[firstLine, ...Array.from({ length: count - 1 }, (_, index) => `export const line${index} = ${index};`)].join("\n")}\n`);
}

async function writeBaseline(fixture, files) {
  await writeFile(path.join(fixture, "scripts/maintainability-baseline.json"), `${JSON.stringify({ version: 1, files }, null, 2)}\n`);
  await runGit(fixture, ["add", "scripts/maintainability-baseline.json", "src"]);
  await runGit(fixture, ["commit", "-qm", "baseline"]);
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

async function runGate(fixture, base = "HEAD", report = false) {
  const args = [path.join(fixture, "scripts/maintainability-gate.mjs")];
  if (base !== null) args.push(`--base=${base}`);
  if (report) args.push("--report");
  return run(process.execPath, args, fixture);
}

async function assertBlocked(fixture, message, pattern) {
  const result = await runGate(fixture);
  assert.equal(result.code, 1, `${message}: ${result.stderr || result.stdout}`);
  assert.match(result.stderr, pattern);
  assert.match(result.stdout, /本门禁不含类型检查/);
}

test("1001-line new file blocks and 999-line new file passes", async () => {
  const fixture = await createFixture();
  try {
    const file = path.join(fixture, "src", "too-large.ts");
    await writeLines(file, 1001);
    await assertBlocked(fixture, "1001-line new file", /blocking-file-size/);
    await writeLines(file, 999);
    const pass = await runGate(fixture);
    assert.equal(pass.code, 0, pass.stderr || pass.stdout);
    assert.match(pass.stdout, /maintainability gate: pass/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("activity admission lists a 700-line file changed 45 times", async () => {
  const fixture = await createFixture();
  try {
    const base = await runGit(fixture, ["rev-parse", "HEAD"]);
    const file = path.join(fixture, "src", "frequent.ts");
    await writeLines(file, 700, "export const touch = 0;");
    await runGit(fixture, ["add", "src/frequent.ts"]);
    await runGit(fixture, ["commit", "-qm", "frequent 1"]);
    for (let index = 2; index <= 45; index += 1) {
      await writeLines(file, 700, `export const touch = ${index};`);
      await runGit(fixture, ["add", "src/frequent.ts"]);
      await runGit(fixture, ["commit", "-qm", `frequent ${index}`]);
    }
    const reportResult = await runGate(fixture, base, true);
    assert.equal(reportResult.code, 0, reportResult.stderr || reportResult.stdout);
    const report = JSON.parse(reportResult.stdout);
    assert.deepEqual(report.splitList.find((item) => item.path === "src/frequent.ts"), {
      path: "src/frequent.ts",
      lines: 700,
      changes90d: 45,
      rule: "activity",
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("legacy file over 800 must shrink when touched", async () => {
  const fixture = await createFixture();
  try {
    const file = path.join(fixture, "src", "legacy.ts");
    await writeLines(file, 801);
    await writeBaseline(fixture, { "src/legacy.ts": { maxLines: 801, category: "source" } });
    const base = await runGit(fixture, ["rev-parse", "HEAD"]);
    await writeLines(file, 802);
    await assertBlocked(fixture, "legacy file grew", /route-must-shrink/);
    await writeLines(file, 800);
    const pass = await runGate(fixture, base);
    assert.equal(pass.code, 0, pass.stderr || pass.stdout);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("baseline ratchet blocks a one-line increase", async () => {
  const fixture = await createFixture();
  try {
    const file = path.join(fixture, "src", "ratchet.ts");
    await writeLines(file, 700);
    await writeBaseline(fixture, { "src/ratchet.ts": { maxLines: 700, category: "source" } });
    await writeLines(file, 701);
    await assertBlocked(fixture, "baseline increase", /baseline-ratchet-increase/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("test, type, and generated files are classified separately", async () => {
  const fixture = await createFixture();
  try {
    await mkdir(path.join(fixture, "src", "generated"), { recursive: true });
    await writeFile(path.join(fixture, "src", "sample.test.ts"), "export const testValue = 1;\n");
    await writeFile(path.join(fixture, "src", "types.ts"), "export type Value = number;\n");
    await writeFile(path.join(fixture, "src", "generated", "client.ts"), "// @generated\nexport const generated = 1;\n");
    const reportResult = await runGate(fixture, "HEAD", true);
    assert.equal(reportResult.code, 0, reportResult.stderr || reportResult.stdout);
    const report = JSON.parse(reportResult.stdout);
    assert.ok(report.categories.test.some((item) => item.path === "src/sample.test.ts"));
    assert.ok(report.categories.type.some((item) => item.path === "src/types.ts"));
    assert.ok(report.categories.generated.some((item) => item.path === "src/generated/client.ts"));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("tracked raw Map changes block in unstaged and staged states", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\nconst cache = new Map();\n");
    await assertBlocked(fixture, "unstaged tracked file", /unbounded-cache-candidate/);
    await runGit(fixture, ["add", "src/sample.ts"]);
    await assertBlocked(fixture, "staged tracked file", /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("new raw Map files block in untracked and staged states", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "new-file.ts"), "export const cache = new Map();\n");
    await assertBlocked(fixture, "untracked new file", /unbounded-cache-candidate/);
    await runGit(fixture, ["add", "src/new-file.ts"]);
    await assertBlocked(fixture, "staged new file", /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
