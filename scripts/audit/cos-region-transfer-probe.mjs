// 一次性只读对照 + 隔离复制测速：同一批真实截图在新加坡/广州的读取与并发读取。
// 不改生产引用；广州桶只允许本次新建，结束时删除对象和桶。
// 运行：set -a; source .env.local; set +a; PERF_ALLOW_COS_TRANSFER=1 node scripts/audit/cos-region-transfer-probe.mjs
import { createHash, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const REGION_SOURCE = process.env.COS_REGION?.trim() || "ap-singapore";
const REGION_TARGET = "ap-guangzhou";
const APP_ID = process.env.COS_APP_ID?.trim() || "1409482292";
const SOURCE_BUCKET = process.env.COS_BUCKET?.trim() || `dydata-screenshot-sg-${APP_ID}`;
const TARGET_BUCKET = `dydata-transfer-gz-${APP_ID}`;
const OUT_DIR = process.env.PERF_OUT_DIR || "/tmp/dydata-cos-transfer";
const SAMPLE_SIZE = Number(process.env.COS_TRANSFER_SAMPLE_SIZE || 10);
const ROUNDS = Number(process.env.COS_TRANSFER_ROUNDS || 5);
const REQUEST_TIMEOUT_MS = Number(process.env.COS_TRANSFER_TIMEOUT_MS || 15_000);
const HEAD_LIMIT = Number(process.env.COS_TRANSFER_HEAD_LIMIT || 20);
const EXPLICIT_KEYS = (process.env.COS_TRANSFER_KEYS || "").split(",").map((key) => key.trim()).filter(Boolean);

if (process.env.PERF_ALLOW_COS_TRANSFER !== "1") {
  throw new Error("此脚本会复制真实截图到隔离广州桶并产生写入；须设置 PERF_ALLOW_COS_TRANSFER=1");
}
const secretId = process.env.COS_SECRET_ID?.trim();
const secretKey = process.env.COS_SECRET_KEY?.trim();
if (!secretId || !secretKey) throw new Error("缺少 COS 凭据");

const creds = { secretId, secretKey };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const enc = (value) => encodeURIComponent(String(value)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, value) => createHmac("sha1", key).update(value).digest("hex");
const sha1 = (value) => createHash("sha1").update(value).digest("hex");

function canonical(params = {}, headers = {}) {
  const sortedParams = Object.entries(params).map(([k, v]) => [k.toLowerCase(), String(v)]).sort(([a], [b]) => a.localeCompare(b));
  const sortedHeaders = Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]).sort(([a], [b]) => a.localeCompare(b));
  return {
    params: sortedParams.map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&"),
    headers: sortedHeaders.map(([k, v]) => `${k}=${enc(v)}`).join("&"),
    paramList: sortedParams.map(([k]) => k).join(";"),
    headerList: sortedHeaders.map(([k]) => k).join(";"),
  };
}

function authorization({ region, bucket, method, pathname, params = {}, headers = {}, expiresIn = 300 }) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + expiresIn}`;
  const signKey = hmac(secretKey, keyTime);
  const c = canonical(params, headers);
  const httpString = `${method.toLowerCase()}\n${pathname}\n${c.params}\n${c.headers}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmac(signKey, stringToSign);
  return [
    "q-sign-algorithm=sha1", `q-ak=${secretId}`, `q-sign-time=${keyTime}`, `q-key-time=${keyTime}`,
    `q-header-list=${c.headerList}`, `q-url-param-list=${c.paramList}`, `q-signature=${signature}`,
  ].join("&");
}

function endpoint(region, bucket, pathname = "/") {
  const host = `${bucket}.cos.${region}.myqcloud.com`;
  return { host, url: `https://${host}${pathname}` };
}

async function request({ region, bucket, method, key = "", params = {}, headers = {}, body = null }) {
  const pathname = key ? `/${key.split("/").map(enc).join("/")}` : "/";
  const { host, url } = endpoint(region, bucket, pathname);
  const signedHeaders = { host, ...headers };
  const auth = authorization({ region, bucket, method, pathname, params, headers: signedHeaders });
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${url}${query ? `?${query}` : ""}`, {
    method,
    headers: { ...signedHeaders, Authorization: auth },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return response;
}

async function listKeys() {
  const response = await request({ region: REGION_SOURCE, bucket: SOURCE_BUCKET, method: "GET", params: { "list-type": "2", "max-keys": "100" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`源桶列举失败 HTTP ${response.status}`);
  return [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]);
}

async function getObject(region, bucket, key) {
  const started = performance.now();
  const response = await request({ region, bucket, method: "GET", key });
  const body = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, ms: Math.round(performance.now() - started), bytes: body.byteLength, body };
}

async function headObject(region, bucket, key) {
  const response = await request({ region, bucket, method: "HEAD", key });
  await response.body?.cancel().catch(() => {});
  return { status: response.status, bytes: Number(response.headers.get("content-length") || 0), contentType: response.headers.get("content-type") || "application/octet-stream" };
}

async function putObject(bucket, key, body, contentType) {
  const response = await request({
    region: REGION_TARGET,
    bucket,
    method: "PUT",
    key,
    headers: { "content-type": contentType, "x-cos-acl": "private" },
    body: Buffer.from(body),
  });
  await response.body?.cancel().catch(() => {});
  return response.status;
}

async function deleteObject(bucket, key) {
  const response = await request({ region: REGION_TARGET, bucket, method: "DELETE", key });
  await response.body?.cancel().catch(() => {});
  return response.status;
}

async function createBucket() {
  const response = await request({ region: REGION_TARGET, bucket: TARGET_BUCKET, method: "PUT" });
  await response.body?.cancel().catch(() => {});
  if (response.status !== 200) throw new Error(`隔离广州桶创建失败 HTTP ${response.status}；停止，不写入已有桶`);
}

async function deleteBucket() {
  const response = await request({ region: REGION_TARGET, bucket: TARGET_BUCKET, method: "DELETE" });
  await response.body?.cancel().catch(() => {});
  return response.status;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

async function concurrentRound(region, bucket, samples) {
  const started = performance.now();
  const results = await Promise.all(samples.map((sample) => getObject(region, bucket, sample.key)));
  return {
    totalMs: Math.round(performance.now() - started),
    bytes: results.reduce((sum, result) => sum + result.bytes, 0),
    statuses: [...new Set(results.map((result) => result.status))],
    objectMs: results.map((result) => result.ms),
  };
}

await mkdir(OUT_DIR, { recursive: true });
const keys = EXPLICIT_KEYS.length ? EXPLICIT_KEYS : await listKeys();
const candidates = [];
console.log(JSON.stringify({ stage: EXPLICIT_KEYS.length ? "using_explicit_keys" : "listed_source_keys", count: keys.length }));
for (const key of keys.slice(0, HEAD_LIMIT)) {
  const head = await headObject(REGION_SOURCE, SOURCE_BUCKET, key);
  if (head.status === 200 && head.bytes >= 20_000 && head.bytes <= 1_500_000) candidates.push({ key, ...head });
  if (candidates.length >= SAMPLE_SIZE) break;
}
if (candidates.length < Math.min(SAMPLE_SIZE, 3)) throw new Error(`源桶可用样本不足：${candidates.length}`);
console.log(JSON.stringify({ stage: "selected_samples", count: Math.min(SAMPLE_SIZE, candidates.length) }));
const samples = [];
for (const candidate of candidates.slice(0, SAMPLE_SIZE)) {
  const source = await getObject(REGION_SOURCE, SOURCE_BUCKET, candidate.key);
  if (source.status !== 200) throw new Error(`源对象读取失败：${candidate.key} HTTP ${source.status}`);
  samples.push({ ...candidate, sourceBytes: source.bytes, sourceSha256: sha256(source.body), body: source.body });
}

await createBucket();
console.log(JSON.stringify({ stage: "created_target_bucket", bucket: TARGET_BUCKET }));
let copied = [];
try {
  for (const sample of samples) {
    const targetKey = `probe/${sample.key}`;
    const status = await putObject(TARGET_BUCKET, targetKey, sample.body, sample.contentType);
    if (status !== 200) throw new Error(`广州对象写入失败：${targetKey} HTTP ${status}`);
    const target = await getObject(REGION_TARGET, TARGET_BUCKET, targetKey);
    if (target.status !== 200 || sha256(target.body) !== sample.sourceSha256) throw new Error(`对象一致性失败：${targetKey}`);
    copied.push({ ...sample, targetKey, targetBytes: target.bytes, targetSha256: sha256(target.body) });
  }
  console.log(JSON.stringify({ stage: "copied_and_verified", count: copied.length }));

  const concurrency = {};
  for (const count of [1, 2, 3, 5, 10]) {
    if (count > copied.length) continue;
    const batch = copied.slice(0, Math.min(count, copied.length));
    const sourceRuns = [];
    const targetRuns = [];
    for (let i = 0; i < ROUNDS; i += 1) {
      sourceRuns.push(await concurrentRound(REGION_SOURCE, SOURCE_BUCKET, batch));
      targetRuns.push(await concurrentRound(REGION_TARGET, TARGET_BUCKET, batch.map((sample) => ({ ...sample, key: sample.targetKey }))));
    }
    concurrency[count] = {
      sampleCount: batch.length,
      source: { runs: sourceRuns, p50Ms: percentile(sourceRuns.map((r) => r.totalMs), 0.5), p95Ms: percentile(sourceRuns.map((r) => r.totalMs), 0.95) },
      guangzhou: { runs: targetRuns, p50Ms: percentile(targetRuns.map((r) => r.totalMs), 0.5), p95Ms: percentile(targetRuns.map((r) => r.totalMs), 0.95) },
    };
  }
  const report = {
    source: { bucket: SOURCE_BUCKET, region: REGION_SOURCE },
    target: { bucket: TARGET_BUCKET, region: REGION_TARGET },
    rounds: ROUNDS,
    samples: copied.map(({ key, targetKey, sourceBytes, targetBytes, sourceSha256, targetSha256 }) => ({ key, targetKey, sourceBytes, targetBytes, sourceSha256, targetSha256, same: sourceSha256 === targetSha256 })),
    concurrency,
  };
  await writeFile(`${OUT_DIR}/cos-region-transfer-result.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const sample of copied) await deleteObject(TARGET_BUCKET, sample.targetKey);
  const bucketStatus = await deleteBucket();
  console.log(JSON.stringify({ cleanup: { bucketStatus } }));
  if (bucketStatus !== 204) throw new Error(`隔离广州桶清理失败 HTTP ${bucketStatus}`);
}
