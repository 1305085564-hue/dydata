import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink, cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkArchitecture, scanArchitecture, runtimeImports } from "./lib/arch-boundary-check.mjs";

const root = process.cwd();
const gateSource = await readFile(path.join(root, "scripts/maintainability-gate.mjs"), "utf8");

async function createFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), "maintainability-gate-"));
  await mkdir(path.join(fixture, "scripts", "lib"), { recursive: true });
  await symlink(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "dir");
  await cp(path.join(root, "scripts/lib/arch-boundary-check.mjs"), path.join(fixture, "scripts/lib/arch-boundary-check.mjs"));
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

test("listed oversized file may be touched at its stored cap", async () => {
  const fixture = await createFixture();
  try {
    const file = path.join(fixture, "src", "listed.ts");
    await writeLines(file, 1001);
    await writeBaseline(fixture, { "src/listed.ts": { maxLines: 1001, category: "source" } });
    await writeLines(file, 1001, "export const changed = true;");
    const result = await runGate(fixture);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /maintainability gate: pass/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("listed oversized file growth hits the baseline ratchet", async () => {
  const fixture = await createFixture();
  try {
    const file = path.join(fixture, "src", "listed.ts");
    await writeLines(file, 1001);
    await writeBaseline(fixture, { "src/listed.ts": { maxLines: 1001, category: "source" } });
    await writeLines(file, 1002);
    await assertBlocked(fixture, "listed file grew", /baseline-ratchet-increase/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("listed oversized file shrinkage remains allowed", async () => {
  const fixture = await createFixture();
  try {
    const file = path.join(fixture, "src", "listed.ts");
    await writeLines(file, 1001);
    await writeBaseline(fixture, { "src/listed.ts": { maxLines: 1001, category: "source" } });
    await writeLines(file, 1000);
    const result = await runGate(fixture);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("new oversized file without a cap still hits blocking-file-size", async () => {
  const fixture = await createFixture();
  try {
    await writeLines(path.join(fixture, "src", "new-listed.ts"), 1001);
    await assertBlocked(fixture, "new oversized file without cap", /blocking-file-size/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("listed oversized file without a cap remains blocked", async () => {
  const fixture = await createFixture();
  try {
    await writeLines(path.join(fixture, "src", "unregistered-listed.ts"), 1001);
    await assertBlocked(fixture, "unregistered listed file", /blocking-file-size/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("raising a listed file cap is blocked by baseline-file-increase", async () => {
  const fixture = await createFixture();
  try {
    const file = path.join(fixture, "src", "listed.ts");
    await writeLines(file, 1001);
    await writeBaseline(fixture, { "src/listed.ts": { maxLines: 1001, category: "source" } });
    const base = await runGit(fixture, ["rev-parse", "HEAD"]);
    await writeBaseline(fixture, { "src/listed.ts": { maxLines: 1002, category: "source" } });
    const result = await runGate(fixture, base);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /baseline-file-increase/);
    assert.match(result.stdout, /本门禁不含类型检查/);
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

test("raw Map without a marker blocks", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const cache = new Map();\n");
    await assertBlocked(fixture, "unmarked raw Map", /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("same-line transient Map marker passes", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const cache = new Map(); // gate:transient-map temporary call-local value\n");
    const result = await runGate(fixture);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("preceding-line transient Map marker passes", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "// gate:transient-map temporary call-local value\nexport const cache = new Map();\n");
    const result = await runGate(fixture);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("preceding code plus transient Map marker cannot exempt the next raw Map", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "const marker = true; // gate:transient-map misleading marker\nexport const cache = new Map();\n");
    await assertBlocked(fixture, "code-plus-marker preceding line", /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("string-literal transient Map marker cannot exempt the next raw Map", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "const marker = \"// gate:transient-map string literal\";\nexport const cache = new Map();\n");
    await assertBlocked(fixture, "string-literal preceding line", /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("one marker cannot exempt a second raw Map hit", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "const first = new Map();\nconst second = new Map(); // gate:transient-map temporary call-local value\n");
    await assertBlocked(fixture, "partially marked raw Maps", /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("globalThis.Map without a marker blocks", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const cache = new globalThis.Map();\n");
    await assertBlocked(fixture, "unmarked globalThis.Map", /unbounded-cache-candidate/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("marked globalThis.Map passes", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const cache = new globalThis.Map(); // gate:transient-map temporary call-local value\n");
    const result = await runGate(fixture);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("new migration function with CURRENT_DATE requires Asia/Shanghai timezone", async () => {
  const fixture = await createFixture();
  try {
    const migration = path.join(fixture, "supabase", "migrations", "20261005130000_timezone_guard.sql");
    await mkdir(path.dirname(migration), { recursive: true });
    await writeFile(migration, `
create or replace function public.sample_today(target_date date default current_date)
returns date
language sql
as $$ select target_date || 'Asia/Shanghai' $$;
`);
    await assertBlocked(fixture, "migration function without timezone", /migration-function-timezone/);

    await writeFile(migration, `
create or replace function public.sample_today(target_date date default current_date)
returns date
language sql
set timezone = 'Asia/Shanghai'
as $$ select target_date $$;
`);
    const pass = await runGate(fixture);
    assert.equal(pass.code, 0, pass.stderr || pass.stdout);
    assert.match(pass.stdout, /maintainability gate: pass/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("new code slicing a UTC date from toISOString blocks; marked calendar math passes", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\nexport const today = new Date().toISOString().slice(0, 10);\n");
    await assertBlocked(fixture, "tracked UTC date slice", /utc-business-date/);

    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\n// gate:utc-date-ok Date.UTC 纯日历运算\nexport const day = new Date(Date.UTC(2026, 0, 1)).toISOString().split(\"T\")[0];\n");
    const pass = await runGate(fixture);
    assert.equal(pass.code, 0, pass.stderr || pass.stdout);

    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\n");
    await writeFile(path.join(fixture, "src", "fresh.ts"), "export const d = new Date().toISOString().substring(0, 10);\n");
    await assertBlocked(fixture, "untracked UTC date slice", /utc-business-date/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("new code hardcoding +08:00 or Asia/Shanghai outside business-time blocks; marked or inside business-time passes", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\nexport const ts = new Date(\"2026-01-01T00:00:00+08:00\");\n");
    await assertBlocked(fixture, "tracked +08:00", /hardcoded-shanghai-timezone/);

    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\n// gate:shanghai-tz-ok 显式豁免说明\nexport const ts = new Date(\"2026-01-01T00:00:00+08:00\");\n");
    const markedPass = await runGate(fixture);
    assert.equal(markedPass.code, 0, markedPass.stderr || markedPass.stdout);

    await writeFile(path.join(fixture, "src", "sample.ts"), "export const value = 1;\n");
    await writeFile(path.join(fixture, "src", "fresh.ts"), "export const tz = \"Asia/Shanghai\";\n");
    await assertBlocked(fixture, "untracked Asia/Shanghai", /hardcoded-shanghai-timezone/);

    await rm(path.join(fixture, "src", "fresh.ts"));
    await mkdir(path.join(fixture, "src", "lib"), { recursive: true });
    await writeFile(path.join(fixture, "src", "lib", "business-time.ts"), "export const TZ = \"Asia/Shanghai\";\nexport const OFFSET = \"+08:00\";\n");
    const canonicalPass = await runGate(fixture);
    assert.equal(canonicalPass.code, 0, canonicalPass.stderr || canonicalPass.stdout);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("ratchet overflow already in the base blocks only when that file is touched", async () => {
  const fixture = await createFixture();
  try {
    const big = path.join(fixture, "src", "big.ts");
    await writeLines(big, 600);
    await writeBaseline(fixture, { "src/big.ts": { maxLines: 550 } });
    const untouched = await runGate(fixture);
    assert.equal(untouched.code, 0, untouched.stderr || untouched.stdout);
    assert.match(untouched.stdout, /超出棘轮上限/);

    await writeLines(big, 599);
    await assertBlocked(fixture, "touched overflow file", /baseline-ratchet-increase/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("运行时图解析别名、相对路径、index、tsx/mjs，并打印闭合环路", () => {
  const sources = {
    "src/lib/a.ts": 'import { b } from "@/lib/dir"; export const a = () => b;',
    "src/lib/dir/index.tsx": 'export { b } from "../b.mjs";',
    "src/lib/b.mjs": 'import { a } from "./a"; export const b = () => a;',
  };
  const result = checkArchitecture(sources);
  assert.equal(result.components.length, 1);
  assert.equal(result.violations.length, 3);
  assert.match(result.violations[0].detail, /src\/lib\/a\.ts -> src\/lib\/dir\/index\.tsx -> src\/lib\/b\.mjs -> src\/lib\/a\.ts/);
});

test("纯类型 import/export 不形成运行时环，混合导入、side effect 和动态字面量纳入图", () => {
  assert.deepEqual(runtimeImports("x.ts", `
import type { A } from "./types";
import { type B } from "./types-b";
export type { C } from "./types-c";
export { type D } from "./types-d";
import { type E, value } from "./mixed";
import "./side-effect";
export * from "./barrel";
const generic = <T>(v: T) => v;
const later = import("./dynamic");
const common = require("./common");
`), ["./mixed", "./side-effect", "./barrel", "./dynamic", "./common"]);
  assert.equal(scanArchitecture({ "src/lib/a.ts": 'import type { B } from "./b";', "src/lib/b.ts": 'import "./a"; export interface B {}' }).components.length, 0);
  assert.equal(scanArchitecture({ "src/lib/a.ts": 'export { type B, value } from "./b.js";', "src/lib/b.ts": 'import "./a"; export const value = 1; export interface B {}' }).components.length, 1);
});

test("分层同时约束运行时和纯类型引用，排除测试与字符串注释", () => {
  const result = checkArchitecture({
    "src/lib/a.ts": 'import { view } from "@/components/card"; import type { Model } from "../app/model"; const text = "import x from @/app/x";',
    "src/lib/a.test.ts": 'import "@/components/test-only";',
    "src/components/card.tsx": 'export const view = 1;',
    "src/app/model.ts": 'export interface Model {}',
    "src/components/test-only.tsx": '',
  });
  assert.equal(result.boundaries.length, 2);
  assert.equal(result.violations.length, 2);
  assert.ok(result.violations.every((entry) => entry.detail.includes("共享逻辑应下沉到 src/lib/")));
});

test("循环与分层基线只减不增，首次安装也不能豁免新增依赖", () => {
  const original = { "src/lib/a.ts": 'import "./b";', "src/lib/b.ts": 'import "./a";', "src/components/card.tsx": '' };
  const before = scanArchitecture(original);
  const baseline = { cycles: Object.fromEntries(before.cycles.map((entry) => [entry.key, "原有环，分批解耦"])), boundaries: {} };
  assert.equal(checkArchitecture(original, baseline, null, original).violations.length, 0);
  const changed = { ...original, "src/lib/b.ts": 'import "./a"; import "@/components/card";' };
  const grown = { ...baseline, boundaries: { "src/lib/b.ts -> src/components/card.tsx": "新加理由也不放行" } };
  assert.ok(checkArchitecture(changed, grown, baseline).violations.some((entry) => entry.type === "architecture-baseline"));
  assert.ok(checkArchitecture(changed, grown, null, original).violations.some((entry) => entry.type === "architecture-baseline"));
  const broken = { ...original, "src/lib/b.ts": 'export const b = 1;' };
  assert.equal(checkArchitecture(broken, { cycles: {}, boundaries: {} }, baseline).violations.length, 0);
  const noReason = { ...baseline, cycles: { ...baseline.cycles, [before.cycles[0].key]: " " } };
  assert.ok(checkArchitecture(original, noReason, baseline).violations.some((entry) => entry.detail.includes("缺少保留理由")));
});

test("已豁免节点内再加新的环边也必须拦截", () => {
  const original = { "src/lib/a.ts": 'import "./b";', "src/lib/b.ts": 'import "./c";', "src/lib/c.ts": 'import "./a";' };
  const baseline = { cycles: Object.fromEntries(scanArchitecture(original).cycles.map(entry => [entry.key, "原有环"])), boundaries: {} };
  const changed = { ...original, "src/lib/a.ts": 'import "./b"; import "./c";' };
  assert.deepEqual(checkArchitecture(changed, baseline, baseline).violations.map(entry => entry.type), ["runtime-cycle"]);
});

test("真实命令阻断未跟踪运行时环和反向导入，移除后恢复", async () => {
  const fixture = await createFixture();
  try {
    await mkdir(path.join(fixture, "src/lib"), { recursive: true });
    await mkdir(path.join(fixture, "src/components"), { recursive: true });
    const a = path.join(fixture, "src/lib/a.ts");
    const b = path.join(fixture, "src/lib/b.mjs");
    await writeFile(a, 'import "./b.mjs";');
    await writeFile(b, 'import "@/lib/a";');
    await assertBlocked(fixture, "runtime cycle", /runtime-cycle/);
    await rm(b);
    await writeFile(path.join(fixture, "src/components/card.tsx"), 'export const view = 1;');
    await writeFile(a, 'import { view } from "@/components/card";');
    await assertBlocked(fixture, "reverse import", /layer-boundary/);
    await rm(a);
    assert.equal((await runGate(fixture)).code, 0);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test("别名中的 ./ 和 ../ 仍能识别环与反向依赖，import() 类型也守边界", () => {
  const sources = {
    "src/lib/a.ts": 'import "@/lib/./b"; type View = import("@/components/card").Props;',
    "src/lib/b.ts": 'import "./a"; import "@/lib/../components/card";',
    "src/components/card.tsx": 'export interface Props {}',
  };
  const result = checkArchitecture(sources);
  assert.equal(result.components.length, 1);
  assert.equal(result.violations.filter(entry => entry.type === "runtime-cycle").length, 2);
  assert.equal(result.violations.filter(entry => entry.type === "layer-boundary").length, 2);
  assert.equal(scanArchitecture({ "src/lib/a.ts": 'type B = import("./b").B;', "src/lib/b.ts": 'import "./a"; export interface B {}' }).components.length, 0);
});
