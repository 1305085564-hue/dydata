import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";

const BUCKET = "submission-screenshots";
const LIMIT = 1000;
const CONCURRENCY = 6;
const RETRIES = 3;
const MANIFEST_DIR = path.resolve("output/screenshot-migration");
const MANIFEST_PATH = path.join(MANIFEST_DIR, "manifest.jsonl");
const execute = process.argv.includes("--execute");
const resume = process.argv.includes("--resume");
// 增量补迁：只处理「manifest 里没有的」或「创建时间晚于水位」的对象。
// 水位来源：--since=<ISO> 优先；否则取现有 manifest 里最晚的一条记录时间。
const incremental = process.argv.includes("--incremental");
const sinceArg = process.argv.find((arg) => arg.startsWith("--since="))?.slice("--since=".length) ?? null;
if (incremental && sinceArg && Number.isNaN(Date.parse(sinceArg))) {
  throw new Error(`--since 不是合法时间：${sinceArg}`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = required("SUPABASE_SERVICE_ROLE_KEY");
const cos = {
  secretId: required("COS_SECRET_ID"),
  secretKey: required("COS_SECRET_KEY"),
  bucket: required("COS_BUCKET"),
  region: required("COS_REGION"),
};

function encodeComponent(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function cosPath(key) {
  return `/${key.split("/").map(encodeComponent).join("/")}`;
}

function canonicalEntries(record) {
  return Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]).sort(([a], [b]) => a.localeCompare(b));
}

function canonical(record) {
  return canonicalEntries(record).map(([key, value]) => `${encodeComponent(key)}=${encodeComponent(value ?? "")}`).join("&");
}

function cosAuthorization(method, pathname, headers = {}, query = {}) {
  const normalized = canonicalEntries(headers);
  const headerRecord = Object.fromEntries(normalized);
  const normalizedQuery = canonicalEntries(query);
  const queryString = normalizedQuery.map(([key, value]) => `${key}=${encodeComponent(value ?? "")}`).join("&");
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 300}`;
  const signKey = createHmac("sha1", cos.secretKey).update(keyTime).digest("hex");
  const httpString = `${method.toLowerCase()}\n${pathname}\n${queryString}\n${canonical(headerRecord)}\n`;
  const stringToSign = `sha1\n${keyTime}\n${createHash("sha1").update(httpString).digest("hex")}\n`;
  const signature = createHmac("sha1", signKey).update(stringToSign).digest("hex");
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${cos.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${normalized.map(([key]) => key).join(";")}`,
    `q-url-param-list=${normalizedQuery.map(([key]) => key).join(";")}`,
    `q-signature=${signature}`,
  ].join("&");
}

async function cosRequest(method, key, options = {}) {
  const host = `${cos.bucket}.cos.${cos.region}.myqcloud.com`;
  const pathname = options.root ? "/" : cosPath(key);
  const headers = { host, ...(options.headers ?? {}) };
  const query = options.query ?? {};
  const queryString = Object.entries(query)
    .map(([name, value]) => `${encodeComponent(name)}=${encodeComponent(String(value))}`)
    .join("&");
  const response = await fetch(`https://${host}${pathname}${queryString ? `?${queryString}` : ""}`, {
    method,
    headers: { ...headers, Authorization: cosAuthorization(method, pathname, headers, query) },
    body: options.body ?? null,
    signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
  });
  return response;
}

async function listCosObjects() {
  const names = [];
  let token = null;
  for (;;) {
    const query = { "list-type": "2", "max-keys": "1000", ...(token ? { "continuation-token": token } : {}) };
    const response = await cosRequest("GET", "", { root: true, query, timeoutMs: 15_000 });
    if (!response.ok) throw new Error(`COS 清单失败 ${response.status}: ${await response.text()}`);
    const xml = await response.text();
    for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) names.push(match[1]);
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    if (!truncated) break;
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? null;
    if (!token) break;
  }
  return names;
}

async function listPrefix(prefix, offset = 0) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "content-type": "application/json" },
    body: JSON.stringify({ prefix, limit: LIMIT, offset, sortBy: { column: "name", order: "asc" } }),
  });
  if (!response.ok) throw new Error(`Supabase 清单失败 ${response.status}: ${await response.text()}`);
  return response.json();
}

async function listObjects() {
  const queue = [""];
  const objects = [];
  while (queue.length) {
    const prefix = queue.shift();
    for (let offset = 0; ; offset += LIMIT) {
      const rows = await listPrefix(prefix, offset);
      for (const row of rows) {
        const objectName = prefix ? `${prefix}/${row.name}` : row.name;
        if (row.id) objects.push({ name: objectName, metadata: row.metadata ?? {}, createdAt: row.created_at ?? null });
        else queue.push(objectName);
      }
      if (rows.length < LIMIT) break;
    }
  }
  return objects;
}

async function downloadSource(objectName) {
  const encoded = objectName.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/${encoded}`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`source_${response.status}`);
  return { body: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "application/octet-stream" };
}

function hashes(body) {
  return {
    sha256: createHash("sha256").update(body).digest("hex"),
    md5: createHash("md5").update(body).digest("hex"),
  };
}

async function headTarget(objectName) {
  const response = await cosRequest("HEAD", objectName, { timeoutMs: 5_000 });
  return {
    ok: response.ok,
    status: response.status,
    size: Number(response.headers.get("content-length") ?? 0),
    sha256: response.headers.get("x-cos-meta-source-sha256"),
    md5: response.headers.get("x-cos-meta-source-md5") ?? ((response.headers.get("etag") ?? "").replaceAll('"', "") || null),
  };
}

async function isAlreadyMigrated(object) {
  const head = await headTarget(object.name);
  const sourceSha = object.metadata.sourceSha256 ?? object.metadata.sha256 ?? null;
  const sourceMd5 = object.metadata.sourceMd5 ?? object.metadata.md5 ?? (String(object.metadata.eTag ?? "").replaceAll('"', "") || null);
  const sourceSize = Number(object.metadata.size ?? object.metadata.contentLength ?? 0);
  return Boolean(head.ok && head.size === sourceSize && ((sourceSha && head.sha256 === sourceSha) || (sourceMd5 && head.md5 === sourceMd5)));
}

async function upload(objectName, source) {
  const digest = hashes(source.body);
  const response = await cosRequest("PUT", objectName, {
    headers: { "content-type": source.contentType, "x-cos-meta-source-sha256": digest.sha256, "x-cos-meta-source-md5": digest.md5 },
    body: Buffer.from(source.body),
  });
  if (!response.ok) throw new Error(`cos_${response.status}`);
  const head = await headTarget(objectName);
  if (!head.ok || head.size !== source.body.byteLength || head.sha256 !== digest.sha256) throw new Error("target_checksum_mismatch");
  return { ...digest, bytes: source.body.byteLength };
}

async function readManifest(force = resume || incremental) {
  const completed = new Map();
  if (!force) return completed;
  try {
    const text = await fs.readFile(MANIFEST_PATH, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const item = JSON.parse(line);
      const itemPath = item.path ?? item.key;
      if (itemPath && (item.status === "ok" || item.status === "skipped" || item.status === "uploaded" || item.status === "source_missing")) completed.set(itemPath, item);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return completed;
}

async function withRetry(fn) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try { return await fn(); } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

await fs.mkdir(MANIFEST_DIR, { recursive: true });
const objects = await listObjects();
const completed = await readManifest();
const watermark = incremental
  ? (sinceArg ?? [...completed.values()].reduce((latest, item) => (item.at && (!latest || item.at > latest) ? item.at : latest), null))
  : null;
const scoped = incremental
  ? objects.filter((object) => !completed.has(object.name) || (object.createdAt && watermark && object.createdAt >= watermark))
  : objects;
const pending = scoped.filter((object) => !completed.has(object.name));
const sampleSize = incremental
  ? Math.max(20, Math.ceil(scoped.length * 0.2))
  : Math.max(70, Math.ceil(objects.length * 0.02));
const sampleCount = Math.min(sampleSize, scoped.length);
const sampleIndexes = new Set(
  Array.from({ length: sampleCount }, (_, index) => Math.floor((index * scoped.length) / sampleCount)),
);

if (!execute) {
  console.log(JSON.stringify({
    mode: incremental ? "incremental-dry-run" : "dry-run",
    bucket: BUCKET,
    region: cos.region,
    watermark,
    total: objects.length,
    scoped: scoped.length,
    pending: pending.length,
    sampleSize,
    concurrency: CONCURRENCY,
    retries: RETRIES,
    note: incremental
      ? "增量模式：只看 manifest 未登记或创建时间晚于水位的对象；COS 已存在且 size 一致即跳过。仅 --execute 才会写 COS。"
      : "仅 --execute 才会写 COS；迁移下载时边下边算 SHA-256/MD5。",
  }, null, 2));
  process.exit(0);
}

const manifest = await fs.open(MANIFEST_PATH, "a");
const failures = [];
const stats = { uploaded: 0, skipped: 0, failed: 0, bytes: 0 };
const sampleHashes = new Map();
const uploadedSizes = new Map();
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= scoped.length) return;
    const object = scoped[index];
    const startedAt = new Date().toISOString();
    try {
      if (incremental) {
        // 幂等：COS 里已有且 size 与源一致，直接跳过，不重复上传、不覆盖。
        const head = await withRetry(() => headTarget(object.name));
        const sourceSize = Number(object.metadata.size ?? object.metadata.contentLength ?? 0);
        if (head.ok && head.size === sourceSize) {
          stats.skipped += 1;
          await manifest.write(`${JSON.stringify({ path: object.name, status: "skipped", reason: "cos_exists_same_size", at: startedAt })}\n`);
          continue;
        }
      } else if (await isAlreadyMigrated(object)) {
        stats.skipped += 1;
        await manifest.write(`${JSON.stringify({ path: object.name, status: "skipped", at: startedAt })}\n`);
        continue;
      }
      const source = await withRetry(() => downloadSource(object.name));
      const digest = hashes(source.body);
      if (sampleIndexes.has(index) || (incremental && sampleHashes.size < sampleSize)) sampleHashes.set(object.name, digest.sha256);
      const uploaded = await withRetry(() => upload(object.name, source));
      uploadedSizes.set(object.name, uploaded.bytes);
      stats.uploaded += 1;
      stats.bytes += uploaded.bytes;
      await manifest.write(`${JSON.stringify({ path: object.name, status: "ok", bytes: uploaded.bytes, sha256: uploaded.sha256, md5: uploaded.md5, at: startedAt, createdAt: object.createdAt })}\n`);
    } catch (error) {
      stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ path: object.name, error: message });
      await manifest.write(`${JSON.stringify({ path: object.name, status: "failed", error: message, at: startedAt })}\n`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scoped.length || 1) }, worker));
await manifest.close();

let sampleOk = 0;
let sampleBad = 0;
const sampleDetails = [];
for (const [objectName, expectedHash] of sampleHashes) {
  try {
    const response = await cosRequest("GET", objectName, { timeoutMs: 8_000 });
    const actual = createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
    const ok = response.ok && actual === expectedHash;
    if (ok) sampleOk += 1;
    else sampleBad += 1;
    sampleDetails.push({ path: objectName, ok });
  } catch {
    sampleBad += 1;
    sampleDetails.push({ path: objectName, ok: false });
  }
}

// 上传后逐个 HEAD 复核 Content-Length 与源一致（只查本轮真正上传的对象）。
const headMismatches = [];
for (const [objectName, expectedBytes] of uploadedSizes) {
  const head = await withRetry(() => headTarget(objectName));
  if (!head.ok || head.size !== expectedBytes) headMismatches.push({ path: objectName, expectedBytes, actualBytes: head.size, status: head.status });
}

// 两边对象数对账：Supabase 有字节对象数 = 元数据行数 − source_missing 数。
const cosNames = await listCosObjects();
const cosNameSet = new Set(cosNames);
const sourceMissing = [...completed.values()].filter((item) => item.status === "source_missing").length
  + failures.filter((item) => /source_(404|400)/.test(item.error)).length;
const expectedSourceNames = objects.filter((object) => completed.get(object.name)?.status !== "source_missing");
const expectedNameSet = new Set(expectedSourceNames.map((object) => object.name));
const missingInCos = expectedSourceNames.filter((object) => !cosNameSet.has(object.name)).map((object) => object.name);
const extraInCos = cosNames.filter((name) => !expectedNameSet.has(name));

const summary = {
  finishedAt: new Date().toISOString(),
  mode: incremental ? "incremental" : "execute",
  bucket: BUCKET,
  region: cos.region,
  watermark,
  total: objects.length,
  scoped: scoped.length,
  pendingBeforeRun: scoped.length,
  migratedObjects: expectedSourceNames.length,
  sourceMissing,
  uploaded: stats.uploaded,
  skipped: stats.skipped,
  failed: stats.failed,
  uploadedBytes: stats.bytes,
  sampleSize,
  sampleChecked: sampleHashes.size,
  sampleOk,
  sampleBad,
  headChecked: uploadedSizes.size,
  headMismatch: headMismatches.length,
  supabaseObjects: objects.length,
  supabaseByteObjects: objects.length - sourceMissing,
  cosObjects: cosNames.length,
  cosMissing: missingInCos.length,
  cosExtra: extraInCos.length,
  failures: failures.slice(0, 20),
  note: "验收分母为现有字节对象；source_missing 为保留的历史缺陷，不删除 Supabase；上传后逐个 HEAD 复核 Content-Length，抽样 ≥20 条比对 SHA-256。",
  details: { sampleDetails, headMismatches: headMismatches.slice(0, 20), missingInCos: missingInCos.slice(0, 20), extraInCos: extraInCos.slice(0, 20) },
};
const reportName = incremental ? `incremental-${summary.finishedAt.replace(/[:.]/g, "-")}.json` : "summary.json";
await fs.writeFile(path.join(MANIFEST_DIR, reportName), `${JSON.stringify(summary, null, 2)}\n`);
if (!incremental) await fs.writeFile(path.join(MANIFEST_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ ...summary, details: undefined }, null, 2));
if (stats.failed > 0 || sampleBad > 0 || headMismatches.length > 0 || missingInCos.length > 0) process.exitCode = 1;
