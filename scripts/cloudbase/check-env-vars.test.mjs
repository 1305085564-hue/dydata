import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertOnlineEnvReady,
  formatReconcileReport,
  parseEnvExample,
  reconcileEnvKeys,
} from "./check-env-vars.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

test(".env.example 完整解析必填与可选变量，无未分类或重复登记项", () => {
  const content = readFileSync(path.join(root, ".env.example"), "utf8");
  const spec = parseEnvExample(content);
  assert.ok(spec.requiredKeys.includes("CLOUDBASE_ENV_ID"));
  assert.ok(spec.requiredKeys.includes("CLOUDBASE_SERVICE_API_KEY"));
  assert.ok(spec.requiredKeys.includes("COS_BUCKET"));
  assert.ok(spec.optionalKeys.includes("NEXT_PUBLIC_SENTRY_DSN"));
  assert.equal(spec.requiredKeys.includes("DYDATA_BACKEND"), false);
  assert.equal(spec.optionalKeys.includes("NEXT_PUBLIC_SUPABASE_URL"), false);
  assert.equal(spec.optionalKeys.includes("BAIDU_OCR_API_KEY"), false);
});

test("对账报告列出缺失必填项与多余线上项，仅含变量名不含值，缺失必填项返回 ok=false", () => {
  const result = reconcileEnvKeys({
    requiredKeys: ["CLOUDBASE_ENV_ID", "COS_BUCKET"],
    optionalKeys: ["AI_MODEL"],
    onlineKeys: ["CLOUDBASE_ENV_ID", "AI_MODEL", "BAIDU_OCR_API_KEY", "NEXT_PUBLIC_SUPABASE_URL"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingRequired, ["COS_BUCKET"]);
  assert.deepEqual(result.unusedOnline, ["BAIDU_OCR_API_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);

  const report = formatReconcileReport(result);
  assert.match(report, /代码必填但线上没配（阻断发版）/);
  assert.match(report, /- COS_BUCKET/);
  assert.match(report, /线上配了但代码不读/);
  assert.match(report, /- BAIDU_OCR_API_KEY/);
  assert.match(report, /- NEXT_PUBLIC_SUPABASE_URL/);
});

test("assertOnlineEnvReady 在缺少必填项时阻断并点名变量，齐全时放行", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "dydata-env-check-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    path.join(dir, ".env.example"),
    "# == [必填] ==\nCLOUDBASE_ENV_ID=x\nCOS_BUCKET=y\n# == [可选] ==\nAI_MODEL=z\n",
  );

  assert.throws(
    () => assertOnlineEnvReady(dir, ["CLOUDBASE_ENV_ID", "BAIDU_OCR_API_KEY"]),
    /COS_BUCKET/,
  );

  const ok = assertOnlineEnvReady(dir, ["CLOUDBASE_ENV_ID", "COS_BUCKET", "BAIDU_OCR_API_KEY"]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.unusedOnline, ["BAIDU_OCR_API_KEY"]);
});
