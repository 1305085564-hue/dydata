import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  countScanRule,
  evaluateExemptions,
  evaluateRegistry,
  findRetiredUsage,
  SCAN_RULES,
} from "./forbidden-list-gate.mjs";

const root = process.cwd();

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

async function git(cwd, args) {
  const result = await run("git", args, cwd);
  if (result.code !== 0) throw new Error(result.stderr || `git exit ${result.code}`);
  return result.stdout.trim();
}

const EMPTY_EXEMPTIONS = { "db-error-leak": {}, "exemption-category-copy": {}, "manual-date-advance": {}, "manual-metric-parse": {} };

async function createFixture() {
  const fixture = await mkdtemp(path.join(tmpdir(), "forbidden-list-gate-"));
  await symlink(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "dir");
  await mkdir(path.join(fixture, "scripts"), { recursive: true });
  await mkdir(path.join(fixture, "src", "app", "api", "demo"), { recursive: true });
  await mkdir(path.join(fixture, "supabase", "migrations"), { recursive: true });
  await writeFile(
    path.join(fixture, "scripts", "forbidden-list-gate.mjs"),
    await readFile(path.join(root, "scripts", "forbidden-list-gate.mjs"), "utf8"),
  );
  await writeFile(
    path.join(fixture, "eslint.config.mjs"),
    'const supabaseAdapterFiles = ["src/lib/supabase/**"];\n// patterns: @supabase/supabase-js\n// rules: no-restricted-imports\n',
  );
  await writeFile(path.join(fixture, "scripts", "guard-exemptions.json"), `${JSON.stringify(EMPTY_EXEMPTIONS, null, 2)}\n`);
  await writeFile(path.join(fixture, "scripts", "guard-reasons.json"), `${JSON.stringify({ "design-token": {}, "api-failure": {}, "screenshot-storage": {}, "source-text-test": {} }, null, 2)}\n`);
  await writeFile(path.join(fixture, "scripts", "design-token-baseline.json"), `${JSON.stringify({ rules: { "font-size": {} } }, null, 2)}\n`);
  await writeFile(path.join(fixture, "scripts", "api-failure-path-exemptions.json"), "{}\n");
  await writeFile(path.join(fixture, "scripts", "source-text-test-baseline.json"), `${JSON.stringify({ files: {} }, null, 2)}\n`);
  await writeFile(
    path.join(fixture, "scripts", "screenshot-storage-allowlist.json"),
    `${JSON.stringify({ production: [{ path: "src/lib/screenshot-storage.ts", reason: "唯一适配器" }], scripts: [], migrations: [] }, null, 2)}\n`,
  );
  await writeFile(path.join(fixture, "src", "app", "api", "demo", "route.ts"), "export const ok = true;\n");
  await writeFile(path.join(fixture, "supabase", "migrations", "20260101000000_init.sql"), "create table demo(id int);\n");
  await git(fixture, ["init", "-q"]);
  await git(fixture, ["config", "user.email", "gate@test.invalid"]);
  await git(fixture, ["config", "user.name", "forbidden list gate"]);
  await git(fixture, ["add", "-A"]);
  await git(fixture, ["commit", "-qm", "fixture"]);
  return fixture;
}

// 与推送前一致：基线是已推送的 main，工作区里新增/修改的内容都算本次改动。
async function runGate(fixture) {
  return run(process.execPath, [path.join(fixture, "scripts", "forbidden-list-gate.mjs"), "--base=HEAD"], fixture);
}

test("新代码把下线功能加回来会被拦下，并写明该用什么", async () => {
  const fixture = await createFixture();
  try {
    for (const [file, source, expectRule] of [
      ["src/app/api/demo/backend.ts", "export const mode = process.env.DYDATA_BACKEND;\n", "backend-switch"],
      ["src/app/api/demo/storage.ts", "export const driver = process.env.SCREENSHOT_STORAGE;\n", "screenshot-storage"],
      ["src/app/api/demo/deploy.ts", "export const region = process.env.VERCEL_REGION;\n", "vercel"],
      ["src/app/api/demo/ocr.ts", "export const key = process.env.BAIDU_OCR_API_KEY;\n", "baidu-ocr"],
    ]) {
      const target = path.join(fixture, file);
      await writeFile(target, source);
      const result = await runGate(fixture);
      assert.equal(result.code, 1, `${file} 未被拦下：${result.stdout}`);
      assert.match(result.stderr, new RegExp(`\\[下线功能加回\\]\\[${expectRule}\\]`));
      assert.match(result.stderr, /该用什么：/);
      await rm(target);
    }
    const clean = await runGate(fixture);
    assert.equal(clean.code, 0, `${clean.stdout}\n${clean.stderr}`);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("注释里提到下线功能不算违规（说明文字不是复辟）", () => {
  const hits = findRetiredUsage([
    { file: "src/lib/x.ts", text: "// 注意：不要再读 DYDATA_BACKEND，已下线" },
    { file: "src/lib/x.ts", text: "export const mode = readBackend();" },
  ]);
  assert.equal(hits.length, 0);
});

test("改已执行过的迁移会被拦下，并说明只能新增", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "supabase", "migrations", "20260101000000_init.sql"), "create table demo(id bigint);\n");
    const result = await runGate(fixture);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stderr, /\[迁移文件被改\]/);
    assert.match(result.stderr, /只能新增/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("把数据库原始报错回给页面会被拦下，豁免名单之外一律不放过", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(
      path.join(fixture, "src", "app", "api", "demo", "route.ts"),
      "export const fail = (error: { message: string }) => ({ error: error.message });\n",
    );
    const result = await runGate(fixture);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stderr, /\[数据库原始报错回页面\]/);
    assert.match(result.stderr, /固定文案 \+ 错误码/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("豁免名单只减不增：计数上调、新增条目都不能悄悄发生", () => {
  const base = { "db-error-leak": { "src/app/api/a.ts": { count: 2, reason: "存量" } } };
  const increased = { "db-error-leak": { "src/app/api/a.ts": { count: 3, reason: "存量" } } };
  assert.deepEqual(evaluateExemptions(base, increased), ["db-error-leak / src/app/api/a.ts：豁免数 2 -> 3；只准减不准增"]);

  const added = { "db-error-leak": { ...base["db-error-leak"], "src/app/api/b.ts": { count: 1, reason: "新接口" } } };
  assert.match(evaluateExemptions(base, added)[0], /只准减不准增/);

  const noReason = { "db-error-leak": { "src/app/api/a.ts": { count: 2, reason: " " } } };
  assert.match(evaluateExemptions(null, noReason)[0], /没写 reason/);
});

test("四个名单新增条目必须带理由；读代码测试名单只准减", () => {
  const base = { files: { "src/a.test.ts": 3 } };
  const grown = { files: { "src/a.test.ts": 4 } };
  assert.match(
    evaluateRegistry({ id: "source-text-test", base, current: grown, reasons: {} }).issues[0],
    /计数 3 -> 4/,
  );
  assert.match(
    evaluateRegistry({ id: "source-text-test", base, current: { files: { "src/a.test.ts": 3, "src/b.test.ts": 1 } }, reasons: {}, hardBlockNew: true }).issues[0],
    /只能减不能加/,
  );
  assert.match(
    evaluateRegistry({ id: "design-token", base: { rules: { "font-size": {} } }, current: { rules: { "font-size": { "src/x.tsx": 1 } } }, reasons: {} }).issues[0],
    /没写理由/,
  );
  assert.deepEqual(
    evaluateRegistry({
      id: "design-token",
      base: { rules: { "font-size": {} } },
      current: { rules: { "font-size": { "src/x.tsx": 1 } } },
      reasons: { "design-token": { "font-size/src/x.tsx": "待换皮页面，阿禅 11-23 同意" } },
    }).issues,
    [],
  );
});

test("删掉 supabase-js 的 lint 规则会被拦下（规则本身不另写一份）", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture, "eslint.config.mjs"), "export default [];\n");
    const result = await runGate(fixture);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stderr, /supabase-js 越界保护缺失/);
    assert.match(result.stderr, /eslint\.config\.mjs/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("棘轮规则覆盖已收成一份的三处规则，并跳到唯一出处", () => {
  const files = {
    "src/x.tsx": 'const label = kind === "leave" ? "请假" : "免交";\nconst next = date.setDate(date.getDate() + 1);\nconst n = Number.parseFloat(value.replace(/%/g, ""));\n',
  };
  const counts = Object.fromEntries(SCAN_RULES.map((rule) => [rule.id, countScanRule(rule, files)]));
  assert.equal(counts["exemption-category-copy"]["src/x.tsx"], 1);
  assert.equal(counts["manual-date-advance"]["src/x.tsx"], 1);
  assert.equal(counts["manual-metric-parse"]["src/x.tsx"], 1);
});

test("当前仓库通过统一禁用清单", async () => {
  const hasOriginMain = (await run("git", ["rev-parse", "--verify", "origin/main"], root)).code === 0;
  const base = hasOriginMain ? "origin/main" : "HEAD";
  const result = await run(process.execPath, [path.join(root, "scripts", "forbidden-list-gate.mjs"), `--base=${base}`], root);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /统一禁用清单通过/);
});

test("旧权限字段门禁覆盖可选、方括号与跨行访问，可信固定矩阵索引不误伤", () => {
  const rule = SCAN_RULES.find((item) => item.id === "legacy-permissions");
  const files = {
    "src/bad.ts": 'const a = profile.permissions?.manage_members;\nconst b = profile["permissions"]["manage_members"];\nconst c = permissions\n  ?.manage_members;\n',
    "src/good.ts": 'const a = hasFixedPermission(role, "manage_members");\nconst b = core.permissions[key];\n// profile.permissions?.manage_members\nconst label = "profile.permissions?.manage_members";\n// gate:legacy-permissions-ok 归档快照，不作授权\nconst snapshot = profile.permissions;\n',
  };
  assert.deepEqual(countScanRule(rule, files), { "src/bad.ts": 3 });
});

test("时间戳切日期门禁覆盖字段、跨行、方括号和组合兜底，数组与纯日期不误伤", () => {
  const rule = SCAN_RULES.find((item) => item.id === "timestamp-date-slice");
  const files = {
    "src/bad.ts": 'const a = row.created_at.slice(0, 10);\nconst b = row["updatedAt"]\n .substring(0, 10);\nconst c = (row.business_date || row.published_at).slice(0, 10);\n',
    "src/good.ts": 'const a = items.slice(0, 10);\nconst b = row.report_date.slice(0, 10);\n// gate:timestamp-date-ok 外部字段为纯日历校验\nconst c = row.created_at.slice(0, 10);\nconst d = "row.createdAt.slice(0, 10)";\n',
    "src/lib/business-time.ts": 'const a = row.created_at.slice(0, 10);',
  };
  assert.deepEqual(countScanRule(rule, files), { "src/bad.ts": 3 });
});

test("两类永久门禁实际阻断新文件，删除违规后恢复绿灯", async () => {
  const fixture = await createFixture();
  try {
    const file = path.join(fixture, "src", "bad.ts");
    for (const [source, label] of [
      ['export const check = profile["permissions"]?.manage_members;', "旧权限字段绕过固定矩阵"],
      ['export const day = row.createdAt.substring(0, 10);', "业务时间戳直接切日期"],
    ]) {
      await writeFile(file, source);
      const result = await runGate(fixture);
      assert.equal(result.code, 1, result.stdout);
      assert.ok(result.stderr.includes(label), result.stderr);
      assert.match(result.stderr, /该用什么/);
    }
    await rm(file);
    assert.equal((await runGate(fixture)).code, 0);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test("日期门禁不把 map/sort 的数组接收者当作时间戳", () => {
  const rule = SCAN_RULES.find((item) => item.id === "timestamp-date-slice");
  assert.deepEqual(countScanRule(rule, { "src/arrays.ts": `const a = items.sort((a,b) => a.created_at.localeCompare(b.created_at)).slice(0, 10);
const b = items.map(item => item.createdAt).slice(0, 10);
const c = (row.created_at ? items : []).slice(0, 10);` }), {});
});

test(".ts 泛型箭头函数不会让后续旧权限和日期违规漏检", () => {
  const prefix = 'const identity = <T>(value: T) => value;\n';
  for (const [id, source] of [
    ["legacy-permissions", prefix + 'const bad = profile.permissions?.manage_members;'],
    ["timestamp-date-slice", prefix + 'const bad = row.created_at.slice(0, 10);'],
  ]) {
    assert.deepEqual(countScanRule(SCAN_RULES.find(item => item.id === id), { "src/generic.ts": source }), { "src/generic.ts": 1 });
  }
});
