#!/usr/bin/env node
/**
 * 截图存储覆盖度对账（只读）
 *
 * 用途：
 *   比对「COS 对象集合」与「Supabase storage.objects 集合」，用于
 *   ① S5 观察期定期对账；② D+30 删除 Supabase 原图前的安全前置检查。
 *
 * 判据（三条全绿才算 PASS，退出码 0）：
 *   1. COS 孤儿对象 = 0（COS 有的，Supabase 记录里必须有）
 *   2. COS 缺失对象 = 0（迁移快照之后新上传的都必须已在 COS）
 *   3. 全部差额都落在 2026-05（= 已知 `source_missing` 382 条），且条数等于 --expect-missing
 *
 * 用法：
 *   node scripts/audit/verify-screenshot-coverage.mjs \
 *     [--bucket=dydata-screenshot-sg-1409482292] [--region=ap-singapore] \
 *     [--snapshot=2026-10-18T16:44:31Z] [--expect-missing=382] [--json-out=/tmp/cov.json]
 *
 * 说明：
 *   - 只读：仅发 COS GET(List) 与 Supabase storage list，不写不删。
 *   - 凭据取自 .env.local（COS_SECRET_ID / COS_SECRET_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）。
 *   - 不进构建产物，不影响线上。
 */
import fs from "node:fs";
import { createHash, createHmac } from "node:crypto";

const BUCKET = "submission-screenshots";
const LIMIT = 1000;

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...loadEnv(argOf("env-file", ".env.local")), ...process.env };
const cos = {
  secretId: env.COS_SECRET_ID,
  secretKey: env.COS_SECRET_KEY,
  bucket: argOf("bucket", env.COS_BUCKET),
  region: argOf("region", env.COS_REGION),
};
const sbUrl = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
const snapshot = argOf("snapshot", "2026-10-18T16:44:31Z");
const expectMissing = Number(argOf("expect-missing", "382"));

for (const [k, v] of Object.entries({ COS_SECRET_ID: cos.secretId, COS_SECRET_KEY: cos.secretKey, COS_BUCKET: cos.bucket, COS_REGION: cos.region, NEXT_PUBLIC_SUPABASE_URL: sbUrl, SUPABASE_SERVICE_ROLE_KEY: sbKey })) {
  if (!v) {
    console.error(`缺少环境变量 ${k}（.env.local 或 --env-file 指定）`);
    process.exit(2);
  }
}

const enc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const entries = (r) => Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]).sort(([a], [b]) => a.localeCompare(b));

function auth(method, pathname, headers, query) {
  const normalized = entries(headers);
  const queryStr = entries(query).map(([k, v]) => `${enc(k)}=${enc(v ?? "")}`).join("&");
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 300}`;
  const signKey = createHmac("sha1", cos.secretKey).update(keyTime).digest("hex");
  const httpString = `${method.toLowerCase()}\n${pathname}\n${queryStr}\n${normalized.map(([k, v]) => `${enc(k)}=${enc(v ?? "")}`).join("&")}\n`;
  const stringToSign = `sha1\n${keyTime}\n${createHash("sha1").update(httpString).digest("hex")}\n`;
  const sig = createHmac("sha1", signKey).update(stringToSign).digest("hex");
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${cos.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${normalized.map(([k]) => k).join(";")}`,
    `q-url-param-list=${entries(query).map(([k]) => k).join(";")}`,
    `q-signature=${sig}`,
  ].join("&");
}

async function listCos() {
  const host = `${cos.bucket}.cos.${cos.region}.myqcloud.com`;
  const names = [];
  let token = null;
  for (;;) {
    const query = { "list-type": "2", "max-keys": "1000", ...(token ? { "continuation-token": token } : {}) };
    const queryStr = Object.entries(query).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
    const headers = { host };
    const res = await fetch(`https://${host}/?${queryStr}`, {
      headers: { ...headers, Authorization: auth("GET", "/", headers, query) },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`COS 清单失败 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) names.push(m[1]);
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
    if (!token) break;
  }
  return names;
}

async function sbList(prefix, offset) {
  const res = await fetch(`${sbUrl}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "content-type": "application/json" },
    body: JSON.stringify({ prefix, limit: LIMIT, offset, sortBy: { column: "name", order: "asc" } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Supabase 清单失败 ${res.status}`);
  return res.json();
}

async function listSb() {
  const queue = [""];
  const out = new Map();
  while (queue.length) {
    const prefix = queue.shift();
    for (let offset = 0; ; offset += LIMIT) {
      const rows = await sbList(prefix, offset);
      for (const row of rows) {
        const name = prefix ? `${prefix}/${row.name}` : row.name;
        if (row.id) out.set(name, { size: row.metadata?.size ?? null, createdAt: row.created_at ?? null });
        else queue.push(name);
      }
      if (rows.length < LIMIT) break;
    }
  }
  return out;
}

const [cosKeys, sb] = await Promise.all([listCos(), listSb()]);
const cosSet = new Set(cosKeys);

const missingInCos = [...sb.keys()].filter((k) => !cosSet.has(k));
const orphanInCos = [...cosSet].filter((k) => !sb.has(k));
const missingNotMay = missingInCos.filter((k) => !/\/2026-05/.test(k));

// 切换为 COS 主写之后，新上传的图**只写 COS、不再回写 Supabase**（见 screenshot-storage.ts
// 写路径：COS 唯一写入目标，失败直接 500，无 Supabase 兜底）。因此「COS 有、Supabase 没有」
// 的对象里，切换日之后的那部分是**预期产出**，不是孤儿；只有切换日之前创建的才算异常。
const SWITCH_DATE = argOf("switch-date", "2026-10-19");
const dateSegmentOf = (key) => key.match(/\/(\d{4}-\d{2}-\d{2})T/)?.[1] ?? "";
const orphanPostSwitch = orphanInCos.filter((k) => dateSegmentOf(k) >= SWITCH_DATE);
const orphanLegacy = orphanInCos.filter((k) => dateSegmentOf(k) < SWITCH_DATE);
const afterSnapshot = [...sb.entries()].filter(([, v]) => v.createdAt && v.createdAt >= snapshot);
const snapshotMissing = afterSnapshot.filter(([k]) => !cosSet.has(k)).map(([k]) => k);

const checks = {
  // 切换后新图不再回写 Supabase（写路径只写 COS），属预期行为，不计入孤儿；
  // 只有「切换日之前创建、却只存在于 COS」的对象才算真孤儿，必须为 0。
  orphanZero: orphanLegacy.length === 0,
  missingAllMay: missingNotMay.length === 0,
  missingCountOk: missingInCos.length === expectMissing,
  snapshotCovered: snapshotMissing.length === 0,
};
const pass = Object.values(checks).every(Boolean);

const result = {
  bucket: cos.bucket,
  region: cos.region,
  cos: cosSet.size,
  supabase: sb.size,
  missingInCos: missingInCos.length,
  expectMissing,
  orphanInCos: orphanInCos.length,
  orphanLegacy: orphanLegacy.length,
  orphanPostSwitch: orphanPostSwitch.length,
  switchDate: SWITCH_DATE,
  missingNotMay: missingNotMay.slice(0, 10),
  snapshotAfterCount: afterSnapshot.length,
  snapshotAfterMissing: snapshotMissing.slice(0, 10),
  checks,
  conclusion: pass ? "PASS" : "FAIL",
};
console.log(JSON.stringify(result, null, 2));

const out = argOf("json-out", "");
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));

process.exit(pass ? 0 : 1);
