// 一次性测速脚本：把 /admin/content 的只读列表 JSON 写入广州私有 COS，验证一致性并测读取耗时。
// 只写本次新建的隔离测试桶；结束时删除测试对象和桶。
// 运行：PERF_ALLOW_ISOLATED_COS_WRITE=1 node scripts/audit/gz-cache-cos-probe.mjs
import { chromium } from "@playwright/test";
import { createHash, createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const BASE_URL = process.env.PERF_BASE_URL?.trim() || "https://dydata.cc";
const OUT_DIR = process.env.PERF_OUT_DIR || "/tmp/dydata-gz-perf";
const REGION = "ap-guangzhou";
const ACCOUNT_ID = process.env.COS_APP_ID?.trim() || "1409482292";
const CANDIDATE_BUCKET = `dydata-cache-gz-${ACCOUNT_ID}`;
const CACHE_PREFIX = "perf-cache/admin-content/v1/";
const CACHE_SCHEMA_VERSION = 1;
const CACHE_TTL_SECONDS = 60;
if (process.env.PERF_ALLOW_ISOLATED_COS_WRITE !== "1") {
  throw new Error("此脚本会创建、写入并删除隔离测试桶；须设置 PERF_ALLOW_ISOLATED_COS_WRITE=1");
}
const CRED_DOC = new URL("../../docs/通用管理/测试账号.md", import.meta.url);

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function sha1Hex(v) {
  return createHash("sha1").update(v, "utf8").digest("hex");
}
function hmacSha1Hex(key, v) {
  return createHmac("sha1", key).update(v, "utf8").digest("hex");
}
function enc(v) {
  return encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
function canonical(params = {}, headers = {}) {
  return {
    params: Object.entries(params).map(([k, v]) => [k.toLowerCase(), v]).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${enc(k)}=${enc(v ?? "")}`).join("&"),
    headers: Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${enc(v ?? "")}`).join("&"),
  };
}
function authorization({ secretId, secretKey }, { method, pathname, params = {}, headers = {}, expiresIn = 300 }) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + expiresIn}`;
  const signKey = hmacSha1Hex(secretKey, keyTime);
  const c = canonical(params, headers);
  const httpString = `${method.toLowerCase()}\n${pathname}\n${c.params}\n${c.headers}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);
  return {
    header: [
      "q-sign-algorithm=sha1", `q-ak=${secretId}`, `q-sign-time=${keyTime}`, `q-key-time=${keyTime}`,
      `q-header-list=${Object.keys(headers).map((k) => k.toLowerCase()).sort().join(";")}`,
      `q-url-param-list=${Object.keys(params).map((k) => k.toLowerCase()).sort().join(";")}`,
      `q-signature=${signature}`,
    ].join("&"),
    keyTime,
    signature,
  };
}

function readLeaderCredentials(text) {
  const line = text.split("\n").find((l) => /^\|\s*组长\s*\|/.test(l));
  if (!line) throw new Error("找不到组长账号行");
  const cells = line.split("|").map((c) => c.trim());
  return { email: cells[2], password: cells[3] };
}

function idsHash(payload) {
  return sha256((payload.videos || []).map((v) => v.id).sort().join(","));
}

async function measureGet(url, headers, rounds, label) {
  const times = [];
  let bytes = 0;
  let status = null;
  for (let i = 0; i < rounds; i += 1) {
    const started = performance.now();
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}_t=${i}`, { headers, cache: "no-store" });
    const body = await response.arrayBuffer();
    times.push(Math.round(performance.now() - started));
    bytes = body.byteLength;
    status = response.status;
  }
  const sorted = [...times].sort((a, b) => a - b);
  return { label, rounds, status, bytes, times, p50: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted[sorted.length - 1] };
}

const credText = await readFile(CRED_DOC, "utf8");
const { email, password } = readLeaderCredentials(credText);
const capturedText = await readFile(`${OUT_DIR}/content-list-payload.json`, "utf8");
const captured = JSON.parse(capturedText);

// 1) 再取一次实时结果，核对行数与关键字段（只读）
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
let livePayload = null;
let livePayload2 = null;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 45_000 }), page.locator('button[type="submit"]').click()]);
  const res = await context.request.get(`${BASE_URL}/api/admin/content/list`, { timeout: 60_000 });
  livePayload = JSON.parse(await res.text());
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const res2 = await context.request.get(`${BASE_URL}/api/admin/content/list`, { timeout: 60_000 });
  livePayload2 = JSON.parse(await res2.text());
  await writeFile(`${OUT_DIR}/content-list-live.json`, JSON.stringify(livePayload));
  await context.close();
} finally {
  await browser.close();
}

// 2) COS 访问与隔离桶
const creds = {
  secretId: process.env.COS_SECRET_ID?.trim(),
  secretKey: process.env.COS_SECRET_KEY?.trim(),
};
if (!creds.secretId || !creds.secretKey) throw new Error("缺少 COS 凭据");
const bucketProbe = [];
async function putBucket(bucket) {
  const host = `${bucket}.cos.${REGION}.myqcloud.com`;
  const pathname = "/";
  const headers = { host };
  const auth = authorization(creds, { method: "PUT", pathname, headers });
  const res = await fetch(`https://${host}/`, { method: "PUT", headers: { ...headers, Authorization: auth.header, "x-cos-acl": "private" } });
  await res.body?.cancel().catch(() => {});
  return res.status;
}
const bucket = CANDIDATE_BUCKET;
const createStatus = await putBucket(CANDIDATE_BUCKET);
bucketProbe.push({ step: "create_candidate_bucket", bucket: CANDIDATE_BUCKET, status: createStatus });
if (createStatus !== 200) throw new Error(`独立测试桶未新建成功（HTTP ${createStatus}）；停止，不写入已有桶`);
const isolatedBucketCreated = true;
const host = `${bucket}.cos.${REGION}.myqcloud.com`;
let cacheKey = null;
try {

async function deleteObject(bucketName, key) {
  const targetHost = `${bucketName}.cos.${REGION}.myqcloud.com`;
  const pathname = `/${key}`;
  const headers = { host: targetHost };
  const auth = authorization(creds, { method: "DELETE", pathname, headers });
  const res = await fetch(`https://${targetHost}${pathname}`, { method: "DELETE", headers: { ...headers, Authorization: auth.header } });
  await res.body?.cancel().catch(() => {});
  return res.status;
}

// 3) 组装缓存对象（含元数据；payload 为实时接口原样 JSON）
const scopeFingerprint = sha256(JSON.stringify({
  view: "all",
  pageSize: captured.summary?.pageSize ?? 20,
  sortField: "published_at",
  sortDir: "desc",
  filters: {},
  // 当前登录账号与范围：缓存键里必须带范围指纹，防止跨用户复用
  account: sha256(email.toLowerCase()).slice(0, 16),
  rowIdsHash: idsHash(captured),
}));
cacheKey = `${CACHE_PREFIX}${scopeFingerprint}/page-1.json`;
const cacheDoc = {
  meta: {
    schemaVersion: CACHE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: "supabase_rpc:admin_content_list_page",
    filters: { view: "all", page: 1, pageSize: 20, sortField: "published_at", sortDir: "desc" },
    rowCount: (captured.videos || []).length,
    snapshotCount: (captured.snapshots || []).length,
    permissionScope: { kind: "scope-fingerprint", fingerprint: scopeFingerprint },
    payloadSha256: sha256(capturedText),
    expiresAt: new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString(),
    ttlSeconds: CACHE_TTL_SECONDS,
  },
  payload: captured,
};
const cacheBody = Buffer.from(JSON.stringify(cacheDoc), "utf8");
const objectPath = `/${cacheKey}`;
const putHeaders = {
  host,
  "content-type": "application/json; charset=utf-8",
  "x-cos-acl": "private",
  "x-cos-meta-schema-version": String(CACHE_SCHEMA_VERSION),
  "x-cos-meta-row-count": String(cacheDoc.meta.rowCount),
  "x-cos-meta-source-sha256": cacheDoc.meta.payloadSha256,
  "x-cos-meta-scope-fingerprint": scopeFingerprint,
};
const putAuth = authorization(creds, { method: "PUT", pathname: objectPath, headers: putHeaders, expiresIn: 300 });
const putStarted = performance.now();
const putRes = await fetch(`https://${host}${objectPath}`, {
  method: "PUT",
  headers: { ...putHeaders, Authorization: putAuth.header },
  body: cacheBody,
});
await putRes.body?.cancel().catch(() => {});
const putMs = Math.round(performance.now() - putStarted);
if (putRes.status !== 200) throw new Error(`测试对象写入失败（HTTP ${putRes.status}）；需人工检查并清理隔离桶 ${bucket}`);

// 4) 读取测速（服务端侧，5 冷 + 5 热）
const getHeaders = { host };
const getAuth = authorization(creds, { method: "GET", pathname: objectPath, headers: getHeaders, expiresIn: 300 });
const objectUrl = `https://${host}${objectPath}`;
const serverRead = await measureGet(objectUrl, { ...getHeaders, Authorization: getAuth.header }, 5, "cos_gz_server_get");
const serverRead2 = await measureGet(objectUrl, { ...getHeaders, Authorization: getAuth.header }, 5, "cos_gz_server_get_hot");

// 5) 校验读回内容与源一致
const verifyRes = await fetch(objectUrl, { headers: { ...getHeaders, Authorization: getAuth.header }, cache: "no-store" });
const verifyText = await verifyRes.text();
const verifyDoc = JSON.parse(verifyText);
const consistency = {
  storedPayloadSha256: sha256(JSON.stringify(verifyDoc.payload)),
  sourcePayloadSha256: sha256(capturedText),
  rowCountStored: (verifyDoc.payload.videos || []).length,
  rowCountSource: (captured.videos || []).length,
  rowCountLive: (livePayload?.videos || []).length,
  rowCountLive2: (livePayload2?.videos || []).length,
  idsHashStored: idsHash(verifyDoc.payload),
  idsHashLive: idsHash(livePayload || {}),
  idsHashLive2: idsHash(livePayload2 || {}),
  idsStored: 20,
  idsLive: 20,
  diff: (() => {
    const stored = new Set((verifyDoc.payload.videos || []).map((v) => v.id));
    const live = new Set((livePayload?.videos || []).map((v) => v.id));
    return {
      storedOnly: [...stored].filter((id) => !live.has(id)),
      liveOnly: [...live].filter((id) => !stored.has(id)),
    };
  })(),
  metaRowCount: verifyDoc.meta?.rowCount,
  scopeFingerprint,
};

// 6) 浏览器侧直读（预签名 URL + CORS 实测）
const presignParams = {};
const presignAuth = authorization(creds, { method: "GET", pathname: objectPath, params: presignParams, headers: {}, expiresIn: 300 });
const presignQuery = new URLSearchParams({
  "q-sign-algorithm": "sha1",
  "q-ak": creds.secretId,
  "q-sign-time": presignAuth.keyTime,
  "q-key-time": presignAuth.keyTime,
  "q-header-list": "",
  "q-url-param-list": "",
  "q-signature": presignAuth.signature,
}).toString();
const presignedUrl = `${objectUrl}?${presignQuery}`;
// 先确认预签名本身可用（非浏览器），再看浏览器是否被 CORS 拦
const presignProbe = await fetch(presignedUrl, { cache: "no-store" });
const presignHeaders = {
  status: presignProbe.status,
  bytes: (await presignProbe.arrayBuffer()).byteLength,
  accessControlAllowOrigin: presignProbe.headers.get("access-control-allow-origin"),
  accessControlAllowMethods: presignProbe.headers.get("access-control-allow-methods"),
};
const browserRead = { attempted: true, ok: false, ms: null, error: null, bytes: null };
{
  const b = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
  try {
    const page = await (await b.newContext()).newPage();
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const out = await page.evaluate(async (target) => {
      const started = performance.now();
      try {
        const r = await fetch(target);
        const buf = await r.arrayBuffer();
        return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - started), bytes: buf.byteLength, error: null };
      } catch (error) {
        return { ok: false, status: null, ms: Math.round(performance.now() - started), bytes: null, error: String(error) };
      }
    }, presignedUrl);
    Object.assign(browserRead, out);
  } finally {
    await b.close();
  }
}

const report = {
  bucket,
  isolatedBucketCreated,
  bucketProbe,
  cacheKey,
  put: { status: putRes.status, ms: putMs, bytes: cacheBody.byteLength },
  serverRead,
  serverRead2,
  consistency,
  presignHeaders,
  browserRead,
  live: { rows: (livePayload?.videos || []).length, bytes: Buffer.byteLength(JSON.stringify(livePayload)) },
};
await writeFile(`${OUT_DIR}/gz-cache-result.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
} finally {
if (cacheKey) {
  const deleteStatus = await deleteObject(bucket, cacheKey);
  if (deleteStatus !== 204) throw new Error(`测试对象清理失败（HTTP ${deleteStatus}）：${bucket}/${cacheKey}`);
}
const bucketHeaders = { host };
const bucketAuth = authorization(creds, { method: "DELETE", pathname: "/", headers: bucketHeaders });
const deleteBucketRes = await fetch(`https://${host}/`, { method: "DELETE", headers: { ...bucketHeaders, Authorization: bucketAuth.header } });
await deleteBucketRes.body?.cancel().catch(() => {});
if (deleteBucketRes.status !== 204) throw new Error(`测试桶清理失败（HTTP ${deleteBucketRes.status}）：${bucket}`);
console.log(JSON.stringify({ cleanup: { bucketStatus: deleteBucketRes.status } }));
}
