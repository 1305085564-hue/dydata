import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const gate = path.join(process.cwd(), "scripts/check-screenshot-storage-boundary.mjs");

test("截图 Storage 边界门禁通过当前仓库扫描", () => {
  const result = spawnSync(process.execPath, [gate], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS/);
});

async function runFixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "screenshot-storage-boundary-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      const target = path.join(root, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, source);
    }
    for (const directory of ["src", "scripts", "supabase"]) {
      await fs.mkdir(path.join(root, directory), { recursive: true });
    }
    return spawnSync(process.execPath, [gate, "--scan-root", root], { encoding: "utf8" });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("门禁拦截所有 Supabase Storage 操作、动态 bucket 与直接 URL", async () => {
  const methods = ["upload", "download", "list", "remove", "createSignedUrl", "createSignedUrls", "getPublicUrl", "copy", "move"];
  for (const method of methods) {
    const result = await runFixture({ "src/route.ts": `supabase.storage.from(bucket).${method}(path);` });
    assert.equal(result.status, 1, `${method} 未被拦截: ${result.stdout} ${result.stderr}`);
    assert.match(result.stderr, /Storage 操作必须通过/);
  }
  const url = await runFixture({ "src/route.ts": "const url = `${supabaseUrl}/storage/v1/object/sign/submission-screenshots/${path}`;" });
  assert.equal(url.status, 1, "直接拼接 Supabase Storage URL 未被拦截");
  const sql = await runFixture({ "supabase/functions/cleanup.sql": "delete from storage.objects where bucket_id = 'submission-screenshots';" });
  assert.equal(sql.status, 1, "SQL 直接操作 storage.objects 未被拦截");
});

test("门禁允许唯一截图适配器和明确列出的审计脚本", async () => {
  const result = await runFixture({
    "src/lib/screenshot-storage.ts": "supabase.storage.from(bucket).upload(path, body);",
    "scripts/audit/verify-screenshot-coverage.mjs": "const url = `${supabaseUrl}/storage/v1/object/list/submission-screenshots`;",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
