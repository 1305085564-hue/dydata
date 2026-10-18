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

function cosAuthorization(method, pathname, headers = {}) {
  const normalized = canonicalEntries(headers);
  const headerRecord = Object.fromEntries(normalized);
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 300}`;
  const signKey = createHmac("sha1", cos.secretKey).update(keyTime).digest("hex");
  const httpString = `${method.toLowerCase()}\n${pathname}\n\n${canonical(headerRecord)}\n`;
  const stringToSign = `sha1\n${keyTime}\n${createHash("sha1").update(httpString).digest("hex")}\n`;
  const signature = createHmac("sha1", signKey).update(stringToSign).digest("hex");
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${cos.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${normalized.map(([key]) => key).join(";")}`,
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
}

async function cosRequest(method, key, options = {}) {
  const host = `${cos.bucket}.cos.${cos.region}.myqcloud.com`;
  const pathname = cosPath(key);
  const headers = { host, ...(options.headers ?? {}) };
  const response = await fetch(`https://${host}${pathname}`, {
    method,
    headers: { ...headers, Authorization: cosAuthorization(method, pathname, headers) },
    body: options.body ?? null,
    signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
  });
  return response;
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
        if (row.id) objects.push({ name: objectName, metadata: row.metadata ?? {} });
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

async function readManifest() {
  const completed = new Map();
  if (!resume) return completed;
  try {
    const text = await fs.readFile(MANIFEST_PATH, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const item = JSON.parse(line);
      const itemPath = item.path ?? item.key;
      if (itemPath && (item.status === "ok" || item.status === "skipped" || item.status === "uploaded")) completed.set(itemPath, item);
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
const sampleSize = Math.max(70, Math.ceil(objects.length * 0.02));
const sampleIndexes = new Set(Array.from({ length: sampleSize }, (_, index) => Math.floor(index * objects.length / sampleSize)));
const completed = await readManifest();
const pending = objects.filter((object) => !completed.has(object.name));

if (!execute) {
  console.log(JSON.stringify({ mode: "dry-run", bucket: BUCKET, count: objects.length, pending: pending.length, sampleSize, concurrency: CONCURRENCY, retries: RETRIES, note: "仅 --execute 才会写 COS；迁移下载时边下边算 SHA-256/MD5。" }, null, 2));
  process.exit(0);
}

const manifest = await fs.open(MANIFEST_PATH, "a");
const failures = [];
const stats = { uploaded: 0, skipped: 0, failed: 0, bytes: 0 };
const sampleHashes = new Map();
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= pending.length) return;
    const object = pending[index];
    const startedAt = new Date().toISOString();
    try {
      if (await isAlreadyMigrated(object)) {
        stats.skipped += 1;
        await manifest.write(`${JSON.stringify({ path: object.name, status: "skipped", at: startedAt })}\n`);
        continue;
      }
      const source = await withRetry(() => downloadSource(object.name));
      const digest = hashes(source.body);
      if (sampleIndexes.has(index)) sampleHashes.set(object.name, digest.sha256);
      const uploaded = await withRetry(() => upload(object.name, source));
      stats.uploaded += 1;
      stats.bytes += uploaded.bytes;
      await manifest.write(`${JSON.stringify({ path: object.name, status: "ok", bytes: uploaded.bytes, sha256: uploaded.sha256, md5: uploaded.md5, at: startedAt })}\n`);
    } catch (error) {
      stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ path: object.name, error: message });
      await manifest.write(`${JSON.stringify({ path: object.name, status: "failed", error: message, at: startedAt })}\n`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length || 1) }, worker));
await manifest.close();

let sampleOk = 0;
let sampleBad = 0;
for (const [objectName, expectedHash] of sampleHashes) {
  try {
    const response = await cosRequest("GET", objectName, { timeoutMs: 8_000 });
    const actual = createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
    if (response.ok && actual === expectedHash) sampleOk += 1;
    else sampleBad += 1;
  } catch {
    sampleBad += 1;
  }
}

const summary = {
  finishedAt: new Date().toISOString(),
  mode: "execute",
  bucket: BUCKET,
  total: objects.length,
  pendingBeforeRun: pending.length,
  uploaded: stats.uploaded,
  skipped: stats.skipped,
  failed: stats.failed,
  uploadedBytes: stats.bytes,
  sampleSize,
  sampleChecked: sampleHashes.size,
  sampleOk,
  sampleBad,
  failures: failures.slice(0, 20),
  note: "只迁移 submission-screenshots；不删除 Supabase；全量 SHA-256/MD5 在下载过程中内联计算。",
};
await fs.writeFile(path.join(MANIFEST_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (stats.failed > 0 || sampleBad > 0) process.exitCode = 1;
