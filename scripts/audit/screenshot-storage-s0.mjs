import fs from "node:fs/promises";
import path from "node:path";

const BUCKET = "submission-screenshots";
const LIMIT = 1000;
const FOUR_POINT_FIVE_MB = 4.5 * 1024 * 1024;
const EIGHT_MB = 8 * 1024 * 1024;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

async function listPrefix(base, key, prefix, offset = 0) {
  const response = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
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
      const rows = await listPrefix(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), prefix, offset);
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

const objects = await listObjects();
const sizes = objects.map((item) => Number(item.metadata.size ?? item.metadata.contentLength ?? 0)).filter(Number.isFinite);
const result = {
  generatedAt: new Date().toISOString(),
  bucket: BUCKET,
  collection: "storage.objects where bucket_id='submission-screenshots'",
  count: objects.length,
  totalBytes: sizes.reduce((total, size) => total + size, 0),
  totalMiB: Number((sizes.reduce((total, size) => total + size, 0) / 1024 / 1024).toFixed(1)),
  maxBytes: Math.max(0, ...sizes),
  maxMiB: Number((Math.max(0, ...sizes) / 1024 / 1024).toFixed(3)),
  over4_5MB: sizes.filter((size) => size > FOUR_POINT_FIVE_MB).length,
  over8MB: sizes.filter((size) => size > EIGHT_MB).length,
  note: "879MB/886MB 的差异来自违规桶；本报告只统计 submission-screenshots。",
};

const outputDir = path.resolve("output/screenshot-migration");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "s0.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
