#!/usr/bin/env node
/**
 * 腾讯云 COS 跨桶迁移与校验脚本：ap-singapore -> ap-shanghai
 *
 * 安全约束：
 *   - 源桶严格只读（仅 GET / HEAD / ListObjectsV2），目标桶只写（PUT / HEAD / ListObjectsV2）。
 *   - 不提供任何删除能力（无 DELETE 方法）。
 *   - 严禁打印或落盘任何 COS_SECRET_ID / COS_SECRET_KEY / Authorization 明文。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

export const DEFAULT_SOURCE_BUCKET = "dydata-screenshot-sg-1409482292";
export const DEFAULT_SOURCE_REGION = "ap-singapore";
export const DEFAULT_TARGET_BUCKET = "dydata-screenshot-sh-1409482292";
export const DEFAULT_TARGET_REGION = "ap-shanghai";
export const DEFAULT_CONCURRENCY = 8;
export const DEFAULT_SAMPLE_SIZE = 50;
export const DEFAULT_RETRIES = 3;
export const DEFAULT_OUTPUT_DIR = "output/cos-sh-migration";

export function parseSyncArgs(argv = process.argv.slice(2)) {
  const args = {
    mode: "dry-run",
    incremental: false,
    since: null,
    sample: DEFAULT_SAMPLE_SIZE,
    concurrency: DEFAULT_CONCURRENCY,
    sourceBucket: DEFAULT_SOURCE_BUCKET,
    sourceRegion: DEFAULT_SOURCE_REGION,
    targetBucket: DEFAULT_TARGET_BUCKET,
    targetRegion: DEFAULT_TARGET_REGION,
    outputDir: DEFAULT_OUTPUT_DIR,
    help: false,
  };

  let explicitModeCount = 0;
  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      args.help = true;
    } else if (item === "--dry-run") {
      args.mode = "dry-run";
      explicitModeCount += 1;
    } else if (item === "--execute") {
      args.mode = "execute";
      explicitModeCount += 1;
    } else if (item === "--verify-only") {
      args.mode = "verify-only";
      explicitModeCount += 1;
    } else if (item === "--incremental") {
      args.incremental = true;
    } else if (item.startsWith("--since=")) {
      args.since = item.slice("--since=".length).trim() || null;
    } else if (item.startsWith("--sample=")) {
      const value = Number(item.slice("--sample=".length));
      if (!Number.isInteger(value) || value < 0) throw new Error(`--sample 必须是非负整数: ${item}`);
      args.sample = value;
    } else if (item.startsWith("--concurrency=")) {
      const value = Number(item.slice("--concurrency=".length));
      if (!Number.isInteger(value) || value < 1 || value > 32) {
        throw new Error(`--concurrency 必须是 1..32 的整数: ${item}`);
      }
      args.concurrency = value;
    } else if (item.startsWith("--source-bucket=")) {
      args.sourceBucket = item.slice("--source-bucket=".length).trim();
    } else if (item.startsWith("--source-region=")) {
      args.sourceRegion = item.slice("--source-region=".length).trim();
    } else if (item.startsWith("--target-bucket=")) {
      args.targetBucket = item.slice("--target-bucket=".length).trim();
    } else if (item.startsWith("--target-region=")) {
      args.targetRegion = item.slice("--target-region=".length).trim();
    } else if (item.startsWith("--output-dir=")) {
      args.outputDir = item.slice("--output-dir=".length).trim();
    } else {
      throw new Error(`未知参数: ${item}`);
    }
  }

  if (explicitModeCount > 1) {
    throw new Error("--dry-run、--execute、--verify-only 不能同时指定");
  }
  if (args.since && Number.isNaN(Date.parse(args.since))) {
    throw new Error(`--since 不是合法 ISO 时间: ${args.since}`);
  }
  if (args.incremental && !args.since && args.mode !== "verify-only") {
    throw new Error("--incremental 需要配合 --since=<ISO> 指定增量水位时间");
  }
  if (args.sourceBucket === args.targetBucket && args.sourceRegion === args.targetRegion) {
    throw new Error("源桶与目标桶完全相同，拒绝执行");
  }

  return args;
}

export function encodeCosComponent(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function cosPathname(key) {
  return key ? `/${key.replace(/^\/+/, "").split("/").map(encodeCosComponent).join("/")}` : "/";
}

function sortedEntries(record) {
  return Object.entries(record)
    .map(([key, value]) => [key.toLowerCase(), String(value ?? "")])
    .sort(([a], [b]) => a.localeCompare(b));
}

function canonicalParams(record) {
  return sortedEntries(record)
    .map(([key, value]) => `${encodeCosComponent(key)}=${encodeCosComponent(value)}`)
    .join("&");
}

function canonicalHeaders(record) {
  return sortedEntries(record)
    .map(([key, value]) => `${key}=${encodeCosComponent(value)}`)
    .join("&");
}

export function buildCosAuthorization({ secretId, secretKey }, { method, pathname, query = {}, headers = {}, expiresIn = 300, now }) {
  const ts = now ?? Math.floor(Date.now() / 1000);
  const keyTime = `${ts - 60};${ts + expiresIn}`;
  const signKey = createHmac("sha1", secretKey).update(keyTime, "utf8").digest("hex");
  const normHeaders = sortedEntries(headers);
  const normQuery = sortedEntries(query);
  const httpString = `${method.toLowerCase()}\n${pathname}\n${canonicalParams(query)}\n${canonicalHeaders(headers)}\n`;
  const stringToSign = `sha1\n${keyTime}\n${createHash("sha1").update(httpString, "utf8").digest("hex")}\n`;
  const signature = createHmac("sha1", signKey).update(stringToSign, "utf8").digest("hex");
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${normHeaders.map(([key]) => key).join(";")}`,
    `q-url-param-list=${normQuery.map(([key]) => key).join(";")}`,
    `q-signature=${signature}`,
  ].join("&");
}

function unescapeXml(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

export function parseListObjectsV2Xml(xml) {
  const objects = [];
  for (const block of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const content = block[1];
    const keyMatch = content.match(/<Key>([\s\S]*?)<\/Key>/);
    const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
    const lastModifiedMatch = content.match(/<LastModified>([\s\S]*?)<\/LastModified>/);
    const etagMatch = content.match(/<ETag>([\s\S]*?)<\/ETag>/);
    if (!keyMatch || !sizeMatch) continue;
    objects.push({
      key: unescapeXml(keyMatch[1]),
      size: Number(sizeMatch[1]),
      lastModified: lastModifiedMatch ? unescapeXml(lastModifiedMatch[1]) : null,
      etag: etagMatch ? unescapeXml(etagMatch[1]).replaceAll('"', "") : null,
    });
  }
  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextTokenMatch = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
  return {
    objects,
    isTruncated,
    nextContinuationToken: isTruncated && nextTokenMatch ? unescapeXml(nextTokenMatch[1]) : null,
  };
}

export function computeSyncPlan(sourceObjects, targetObjects, { incremental = false, since = null } = {}) {
  const sinceMs = incremental && since ? Date.parse(since) : null;
  const targetByKey = new Map(targetObjects.map((item) => [item.key, item])); // gate:transient-map CLI 批处理索引
  const scoped = sinceMs === null
    ? sourceObjects
    : sourceObjects.filter((item) => item.lastModified && Date.parse(item.lastModified) >= sinceMs);

  const toCopy = [];
  const skipped = [];
  for (const source of scoped) {
    const target = targetByKey.get(source.key);
    if (target && target.size === source.size) {
      skipped.push(source);
    } else {
      toCopy.push({
        ...source,
        reason: target ? "size_mismatch" : "missing_in_target",
        targetSize: target ? target.size : null,
      });
    }
  }

  return {
    sourceTotal: sourceObjects.length,
    targetTotal: targetObjects.length,
    scopedTotal: scoped.length,
    toCopy,
    skipped,
  };
}

export function computeVerifyDiff(sourceObjects, targetObjects) {
  const targetByKey = new Map(targetObjects.map((item) => [item.key, item])); // gate:transient-map CLI 对账索引
  const sourceKeys = new Set(sourceObjects.map((item) => item.key));
  const missing = [];
  const sizeMismatch = [];
  const matched = [];

  for (const source of sourceObjects) {
    const target = targetByKey.get(source.key);
    if (!target) {
      missing.push(source.key);
    } else if (target.size !== source.size) {
      sizeMismatch.push({ key: source.key, sourceSize: source.size, targetSize: target.size });
    } else {
      matched.push(source);
    }
  }

  const extra = targetObjects.filter((item) => !sourceKeys.has(item.key)).map((item) => item.key);
  return {
    sourceTotal: sourceObjects.length,
    targetTotal: targetObjects.length,
    matchedCount: matched.length,
    matched,
    missing,
    sizeMismatch,
    extra,
  };
}

export function pickSampleObjects(objects, sampleCount) {
  const count = Math.min(Math.max(0, sampleCount), objects.length);
  if (count === 0) return [];
  if (count === objects.length) return [...objects];
  const copy = [...objects];
  // Fisher-Yates shuffle on copy for uniform random sampling
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, count);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function createCosClient(credentials, { bucket, region, readOnly = false }) {
  const host = `${bucket}.cos.${region}.myqcloud.com`;

  async function request(method, key, options = {}) {
    const upperMethod = method.toUpperCase();
    if (upperMethod === "DELETE") {
      throw new Error("安全禁区：本脚本严禁执行任何 DELETE 请求");
    }
    if (readOnly && upperMethod !== "GET" && upperMethod !== "HEAD") {
      throw new Error(`安全禁区：源桶严格只读，禁止执行 ${upperMethod}`);
    }

    const pathname = options.root ? "/" : cosPathname(key);
    const query = options.query ?? {};
    const headers = { host, ...(options.headers ?? {}) };
    const authorization = buildCosAuthorization(credentials, {
      method: upperMethod,
      pathname,
      query,
      headers,
    });
    const queryString = Object.entries(query)
      .map(([k, v]) => `${encodeCosComponent(k)}=${encodeCosComponent(String(v))}`)
      .join("&");

    return fetch(`https://${host}${pathname}${queryString ? `?${queryString}` : ""}`, {
      method: upperMethod,
      headers: { ...headers, Authorization: authorization },
      body: options.body ?? null,
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  }

  async function listAll() {
    const items = [];
    let token = null;
    for (;;) {
      const query = { "list-type": "2", "max-keys": "1000", ...(token ? { "continuation-token": token } : {}) };
      const response = await withRetry(() => request("GET", "", { root: true, query, timeoutMs: 20_000 }));
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`COS 列举失败 (${bucket}): HTTP ${response.status} ${text.slice(0, 200)}`);
      }
      const xml = await response.text();
      const parsed = parseListObjectsV2Xml(xml);
      items.push(...parsed.objects);
      if (!parsed.isTruncated || !parsed.nextContinuationToken) break;
      token = parsed.nextContinuationToken;
    }
    return items;
  }

  return { host, bucket, region, request, listAll };
}

async function withRetry(fn, retries = DEFAULT_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

function extractUserMetaHeaders(headers) {
  const meta = {};
  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase().startsWith("x-cos-meta-") && value) {
      meta[name.toLowerCase()] = value;
    }
  }
  return meta;
}

async function copyViaServerSide(sourceClient, targetClient, object) {
  const copySource = `${sourceClient.host}${cosPathname(object.key)}`;
  const response = await targetClient.request("PUT", object.key, {
    headers: {
      "x-cos-copy-source": copySource,
      "x-cos-metadata-directive": "Copy",
    },
    timeoutMs: 30_000,
  });
  const text = await response.text().catch(() => "");
  if (!response.ok || /<Error>/i.test(text)) {
    const code = text.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? `HTTP_${response.status}`;
    const err = new Error(`cos_copy_${response.status}_${code}`);
    err.status = response.status;
    err.cosCode = code;
    throw err;
  }
  const etag = text.match(/<ETag>([^<]+)<\/ETag>/)?.[1]?.replaceAll('"', "") ?? null;
  return { mode: "server_copy", bytes: object.size, etag };
}

async function copyViaStreamFallback(sourceClient, targetClient, object) {
  const getResp = await sourceClient.request("GET", object.key, { timeoutMs: 30_000 });
  if (!getResp.ok) {
    await getResp.body?.cancel().catch(() => undefined);
    throw new Error(`source_get_${getResp.status}`);
  }
  const bytes = new Uint8Array(await getResp.arrayBuffer());
  if (bytes.byteLength !== object.size) {
    throw new Error(`source_size_mismatch_${bytes.byteLength}_vs_${object.size}`);
  }
  const contentType = getResp.headers.get("content-type") || "application/octet-stream";
  const userMeta = extractUserMetaHeaders(getResp.headers);
  const contentMd5 = createHash("md5").update(bytes).digest("base64");

  const putResp = await targetClient.request("PUT", object.key, {
    headers: {
      "content-type": contentType,
      "content-md5": contentMd5,
      ...userMeta,
    },
    body: Buffer.from(bytes),
    timeoutMs: 30_000,
  });
  await putResp.body?.cancel().catch(() => undefined);
  if (!putResp.ok) {
    throw new Error(`target_put_${putResp.status}`);
  }

  const headResp = await targetClient.request("HEAD", object.key, { timeoutMs: 10_000 });
  await headResp.body?.cancel().catch(() => undefined);
  const headSize = Number(headResp.headers.get("content-length") ?? -1);
  if (!headResp.ok || headSize !== bytes.byteLength) {
    throw new Error(`target_head_mismatch_${headSize}_vs_${bytes.byteLength}`);
  }

  return {
    mode: "stream_fallback",
    bytes: bytes.byteLength,
    contentType,
    etag: putResp.headers.get("etag")?.replaceAll('"', "") ?? null,
  };
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  async function runner() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, runner));
}

async function runVerify({ sourceClient, targetClient, sourceObjects, targetObjects, sampleCount, concurrency, outputDir }) {
  const diff = computeVerifyDiff(sourceObjects, targetObjects);
  const samples = pickSampleObjects(diff.matched, sampleCount);
  const sampleMismatches = [];
  let sampleMatched = 0;

  await runPool(samples, concurrency, async (item) => {
    const [srcResp, dstResp] = await Promise.all([
      withRetry(() => sourceClient.request("GET", item.key, { timeoutMs: 25_000 })),
      withRetry(() => targetClient.request("GET", item.key, { timeoutMs: 25_000 })),
    ]);

    if (!srcResp.ok || !dstResp.ok) {
      await srcResp.body?.cancel().catch(() => undefined);
      await dstResp.body?.cancel().catch(() => undefined);
      sampleMismatches.push({
        key: item.key,
        reason: `http_status_${srcResp.status}_vs_${dstResp.status}`,
      });
      return;
    }

    const [srcBuf, dstBuf] = await Promise.all([
      srcResp.arrayBuffer().then((b) => new Uint8Array(b)),
      dstResp.arrayBuffer().then((b) => new Uint8Array(b)),
    ]);
    const srcSha = createHash("sha256").update(srcBuf).digest("hex");
    const dstSha = createHash("sha256").update(dstBuf).digest("hex");
    const srcType = srcResp.headers.get("content-type") ?? null;
    const dstType = dstResp.headers.get("content-type") ?? null;

    if (srcSha !== dstSha || srcBuf.byteLength !== dstBuf.byteLength || srcType !== dstType) {
      sampleMismatches.push({
        key: item.key,
        reason: srcSha !== dstSha ? "sha256_mismatch" : srcBuf.byteLength !== dstBuf.byteLength ? "byte_length_mismatch" : "content_type_mismatch",
        srcSha,
        dstSha,
        srcBytes: srcBuf.byteLength,
        dstBytes: dstBuf.byteLength,
        srcType,
        dstType,
      });
      return;
    }

    sampleMatched += 1;
  });

  const report = {
    finishedAt: new Date().toISOString(),
    mode: "verify-only",
    source: { bucket: sourceClient.bucket, region: sourceClient.region },
    target: { bucket: targetClient.bucket, region: targetClient.region },
    sourceTotal: diff.sourceTotal,
    targetTotal: diff.targetTotal,
    matchedCount: diff.matchedCount,
    missing: diff.missing.length,
    sizeMismatch: diff.sizeMismatch.length,
    extraInTarget: diff.extra.length,
    sampleRequested: samples.length,
    sampleMatched,
    sampleMismatch: sampleMismatches.length,
    missingKeysSample: diff.missing.slice(0, 20),
    sizeMismatchSample: diff.sizeMismatch.slice(0, 20),
    sampleMismatches: sampleMismatches.slice(0, 20),
  };

  await fs.mkdir(outputDir, { recursive: true });
  const stamp = report.finishedAt.replace(/[:.]/g, "-");
  await fs.writeFile(path.join(outputDir, `verify-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (report.missing > 0 || report.sizeMismatch > 0 || report.sampleMismatch > 0) {
    process.exitCode = 1;
  }
}

async function runExecute({ args, sourceClient, targetClient, sourceObjects, targetObjects, outputDir }) {
  const plan = computeSyncPlan(sourceObjects, targetObjects, {
    incremental: args.incremental,
    since: args.since,
  });

  await fs.mkdir(outputDir, { recursive: true });
  const manifestFile = await fs.open(path.join(outputDir, "manifest.jsonl"), "a");
  const stats = {
    copied: 0,
    serverCopyCount: 0,
    streamFallbackCount: 0,
    skipped: plan.skipped.length,
    failed: 0,
    copiedBytes: 0,
  };
  const failures = [];
  let allowServerSideCopy = true;

  // 先用第一个待复制对象探测跨地域 x-cos-copy-source 是否可用
  const copyItems = [...plan.toCopy];
  if (copyItems.length > 0) {
    const first = copyItems[0];
    try {
      const result = await withRetry(() => copyViaServerSide(sourceClient, targetClient, first), 1);
      stats.copied += 1;
      stats.serverCopyCount += 1;
      stats.copiedBytes += result.bytes;
      await manifestFile.write(`${JSON.stringify({ key: first.key, status: "copied", mode: result.mode, bytes: result.bytes, at: new Date().toISOString() })}\n`);
      copyItems.shift();
    } catch {
      allowServerSideCopy = false;
    }
  }

  await runPool(copyItems, args.concurrency, async (item) => {
    const at = new Date().toISOString();
    try {
      const result = allowServerSideCopy
        ? await withRetry(async () => {
            try {
              return await copyViaServerSide(sourceClient, targetClient, item);
            } catch (copyError) {
              if (copyError?.status && [400, 403, 405, 501].includes(copyError.status)) {
                return await copyViaStreamFallback(sourceClient, targetClient, item);
              }
              throw copyError;
            }
          })
        : await withRetry(() => copyViaStreamFallback(sourceClient, targetClient, item));

      stats.copied += 1;
      if (result.mode === "server_copy") stats.serverCopyCount += 1;
      else stats.streamFallbackCount += 1;
      stats.copiedBytes += result.bytes;
      await manifestFile.write(`${JSON.stringify({ key: item.key, status: "copied", mode: result.mode, bytes: result.bytes, at })}\n`);
    } catch (error) {
      stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ key: item.key, error: message });
      await manifestFile.write(`${JSON.stringify({ key: item.key, status: "failed", error: message, at })}\n`);
    }
  });

  await manifestFile.close();

  const summary = {
    finishedAt: new Date().toISOString(),
    mode: args.incremental ? "incremental-execute" : "execute",
    since: args.since,
    source: { bucket: sourceClient.bucket, region: sourceClient.region },
    target: { bucket: targetClient.bucket, region: targetClient.region },
    sourceTotal: plan.sourceTotal,
    targetBeforeRun: plan.targetTotal,
    scopedTotal: plan.scopedTotal,
    copied: stats.copied,
    serverCopyCount: stats.serverCopyCount,
    streamFallbackCount: stats.streamFallbackCount,
    skipped: stats.skipped,
    failed: stats.failed,
    copiedBytes: stats.copiedBytes,
    failures: failures.slice(0, 20),
  };

  const stamp = summary.finishedAt.replace(/[:.]/g, "-");
  await fs.writeFile(path.join(outputDir, `sync-${stamp}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "latest-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));

  if (stats.failed > 0) process.exitCode = 1;
}

async function main() {
  const args = parseSyncArgs();
  if (args.help) {
    console.log(`用法：
  node --env-file=.env.local scripts/sync-cos-sg-to-sh.mjs [--dry-run | --execute | --verify-only] [选项]

选项：
  --dry-run               默认模式：仅列举并比对，不写入目标桶
  --execute               执行同步（优先 x-cos-copy-source，受限时自动流式 GET→PUT）
  --incremental           仅处理 LastModified >= --since 的增量对象
  --since=<ISO>           增量水位时间
  --verify-only           全量对账 Key/Size，并随机抽样比对 SHA-256 与 Content-Type
  --sample=<N>            抽样数，默认 ${DEFAULT_SAMPLE_SIZE}
  --concurrency=<N>       并发数，默认 ${DEFAULT_CONCURRENCY}
`);
    return;
  }

  const credentials = {
    secretId: requiredEnv("COS_SECRET_ID"),
    secretKey: requiredEnv("COS_SECRET_KEY"),
  };
  const sourceClient = createCosClient(credentials, {
    bucket: args.sourceBucket,
    region: args.sourceRegion,
    readOnly: true,
  });
  const targetClient = createCosClient(credentials, {
    bucket: args.targetBucket,
    region: args.targetRegion,
    readOnly: false,
  });

  const [sourceObjects, targetObjects] = await Promise.all([
    sourceClient.listAll(),
    targetClient.listAll(),
  ]);

  if (args.mode === "verify-only") {
    await runVerify({
      sourceClient,
      targetClient,
      sourceObjects,
      targetObjects,
      sampleCount: args.sample,
      concurrency: args.concurrency,
      outputDir: args.outputDir,
    });
    return;
  }

  if (args.mode === "dry-run") {
    const plan = computeSyncPlan(sourceObjects, targetObjects, {
      incremental: args.incremental,
      since: args.since,
    });
    const report = {
      finishedAt: new Date().toISOString(),
      mode: args.incremental ? "incremental-dry-run" : "dry-run",
      since: args.since,
      source: { bucket: sourceClient.bucket, region: sourceClient.region },
      target: { bucket: targetClient.bucket, region: targetClient.region },
      sourceTotal: plan.sourceTotal,
      targetTotal: plan.targetTotal,
      scopedTotal: plan.scopedTotal,
      toCopy: plan.toCopy.length,
      skipped: plan.skipped.length,
      bytesToCopy: plan.toCopy.reduce((sum, item) => sum + item.size, 0),
    };
    await fs.mkdir(args.outputDir, { recursive: true });
    await fs.writeFile(path.join(args.outputDir, "dry-run.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  await runExecute({
    args,
    sourceClient,
    targetClient,
    sourceObjects,
    targetObjects,
    outputDir: args.outputDir,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[sync-cos-sg-to-sh] 失败: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
