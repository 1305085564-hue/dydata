import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertGateEnvironment } from "./assert-local-gate-env.mjs";
import { assertGateRevisionUnchanged, assertApplicationTreeClean, lockGateRevision } from "./gate-lock.mjs";

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function createFixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "dydata-gate-lock-"));
  await mkdir(path.join(cwd, "src"));
  await writeFile(path.join(cwd, "src", "app.ts"), "export const value = 1;\n");
  await writeFile(
    path.join(cwd, ".env.ai-test.local"),
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres\n",
  );
  git(cwd, ["init", "-q"]);
  git(cwd, ["config", "user.email", "gate@test.invalid"]);
  git(cwd, ["config", "user.name", "gate lock test"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "fixture"]);
  return cwd;
}

test("门禁环境预检拒绝 src/ 未提交应用代码", async () => {
  const cwd = await createFixture();
  try {
    assert.doesNotThrow(() => assertGateEnvironment({} as NodeJS.ProcessEnv, cwd));
    await writeFile(path.join(cwd, "src", "app.ts"), "export const value = 2;\n");
    assert.throws(
      () => assertGateEnvironment({} as NodeJS.ProcessEnv, cwd),
      /主树有未提交应用代码/,
    );
    assert.throws(() => assertApplicationTreeClean(cwd), /主树有未提交应用代码/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("门禁锁存 HEAD，并在运行期间提交变化后判读数无效", async () => {
  const cwd = await createFixture();
  try {
    const revision = lockGateRevision(cwd);
    assertGateRevisionUnchanged(revision, cwd);
    await writeFile(path.join(cwd, "README.md"), "changed\n");
    git(cwd, ["add", "README.md"]);
    git(cwd, ["commit", "-qm", "advance"]);
    assert.throws(
      () => assertGateRevisionUnchanged(revision, cwd),
      /门禁读数无效.*开跑时 HEAD=.*结束时 HEAD=/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
