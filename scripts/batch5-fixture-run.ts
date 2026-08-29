import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  BATCH5_CLEANUP_ORDER,
  buildBatch5DatePlan,
  buildBatch5FixtureLabels,
  normalizeBatch5RunId,
  type Batch5CleanupResource,
  validateBatch5StoragePaths,
} from "../src/lib/batch5-fixture-contract";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const CREDENTIALS_PATH = path.resolve(
  process.env.DYDATA_TEST_CREDENTIALS_FILE ?? path.join(process.cwd(), "docs/reference/测试账号.md"),
);
const OUTPUT_DIR = path.resolve(process.cwd(), "output/batch5");

type Credential = { email: string; password: string };
type Manifest = {
  runId: string;
  createdAt: string;
  uploadDate: string;
  businessDate: string;
  claimIds: string[];
  dailyReportIds: string[];
  videoIds: string[];
  snapshotIds: string[];
  videoTagIds: string[];
  usageRecordIds: string[];
  exemptionRequestIds: string[];
  exemptionGrantIds: string[];
  storagePaths: string[];
};

function parseCredentials(content: string) {
  const result = new Map<string, Credential>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("|") || line.startsWith("|---")) continue;
    const columns = line.split("|").slice(1, -1).map((value) => value.trim());
    if (columns.length < 4 || columns[0] === "账号") continue;
    const [alias, email, password] = columns;
    if (alias && email && password) result.set(alias, { email, password });
  }
  return result;
}

function requireConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 Supabase 服务端配置");
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error("本地测试账号文件不存在");
  return { url, key };
}

async function resolveFixtureUserId(supabase: SupabaseClient) {
  const credentials = parseCredentials(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const credential = credentials.get("批次5账号#4");
  if (!credential) throw new Error("账号#4凭据代号缺失");
  for (let page = 1; ; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error("读取账号#4 Auth 用户失败");
    const matches = (result.data.users ?? []).filter((user) => user.email === credential.email);
    if (matches.length > 1) throw new Error("账号#4发现重复 Auth 用户");
    if (matches.length === 1) return matches[0].id;
    if ((result.data.users ?? []).length < 1000) break;
  }
  throw new Error("账号#4 Auth 用户不存在");
}

async function resolveFixtureAccountId(supabase: SupabaseClient, userId: string) {
  const result = await supabase.from("accounts").select("id").eq("profile_id", userId).limit(2);
  if (result.error) throw new Error("读取账号#4归属账号失败");
  if (result.data?.length !== 1) throw new Error("账号#4必须恰好有一个归属账号，停止夹具操作");
  return result.data[0].id as string;
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function argValues(name: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function emptyManifest(runId: string, datePlan: { uploadDate: string; businessDate: string }): Manifest {
  return {
    runId,
    createdAt: new Date().toISOString(),
    uploadDate: datePlan.uploadDate,
    businessDate: datePlan.businessDate,
    claimIds: [],
    dailyReportIds: [],
    videoIds: [],
    snapshotIds: [],
    videoTagIds: [],
    usageRecordIds: [],
    exemptionRequestIds: [],
    exemptionGrantIds: [],
    storagePaths: [],
  };
}

function assertUuidList(values: string[], label: string) {
  if (values.some((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
    throw new Error(`${label}包含无效 ID，停止清理`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${label}存在重复 ID，停止清理`);
}

function manifestPath(runId: string) {
  return path.join(OUTPUT_DIR, `${runId}.json`);
}

async function discoverFixtureStoragePaths(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  expectedCount: number,
) {
  const paths: string[] = [];
  for (const role of ["screenshot_1", "screenshot_2"] as const) {
    const prefix = `${userId}/${accountId}/${role}`;
    const result = await supabase.storage.from("submission-screenshots").list(prefix, { limit: 100 });
    if (result.error) throw new Error("读取批次5截图夹具失败");
    for (const entry of result.data ?? []) {
      if (entry.id && entry.name) paths.push(`${prefix}/${entry.name}`);
    }
  }

  const normalized = validateBatch5StoragePaths(paths, { userId, accountId });
  if (normalized.length !== expectedCount) {
    throw new Error("当前截图夹具数量与预期不一致，停止清理");
  }
  return normalized;
}

async function collectManifest(
  supabase: SupabaseClient,
  runId: string,
  datePlan: { uploadDate: string; businessDate: string },
) {
  const userId = await resolveFixtureUserId(supabase);
  const labels = buildBatch5FixtureLabels(runId);
  const manifest = emptyManifest(runId, datePlan);

  const reportsResult = await supabase
    .from("daily_reports")
    .select("id")
    .eq("user_id", userId)
    .like("content", `%${runId}%`);
  if (reportsResult.error) throw new Error("收集日报夹具失败");
  manifest.dailyReportIds = (reportsResult.data ?? []).map((row) => row.id as string);

  const videosResult = await supabase
    .from("videos")
    .select("id")
    .eq("user_id", userId)
    .like("content", `%${runId}%`);
  if (videosResult.error) throw new Error("收集视频夹具失败");
  manifest.videoIds = (videosResult.data ?? []).map((row) => row.id as string);

  if (manifest.videoIds.length) {
    const [snapshotsResult, tagsResult] = await Promise.all([
      supabase.from("video_metrics_snapshots").select("id").in("video_id", manifest.videoIds),
      supabase.from("video_tags").select("id").in("video_id", manifest.videoIds),
    ]);
    if (snapshotsResult.error || tagsResult.error) throw new Error("收集视频派生夹具失败");
    manifest.snapshotIds = (snapshotsResult.data ?? []).map((row) => row.id as string);
    manifest.videoTagIds = (tagsResult.data ?? []).map((row) => row.id as string);
  }

  if (manifest.dailyReportIds.length) {
    const usageResult = await supabase.from("script_usage_records").select("id").in("daily_report_id", manifest.dailyReportIds);
    if (usageResult.error) throw new Error("收集话术使用夹具失败");
    manifest.usageRecordIds = (usageResult.data ?? []).map((row) => row.id as string);
  }

  const requestsResult = await supabase
    .from("exemption_request")
    .select("id")
    .eq("applicant_user_id", userId)
    .like("reason", `%${labels.exemption}%`);
  if (requestsResult.error) throw new Error("收集豁免申请夹具失败");
  manifest.exemptionRequestIds = (requestsResult.data ?? []).map((row) => row.id as string);

  if (manifest.exemptionRequestIds.length) {
    const grantsResult = await supabase.from("exemption_grant").select("id").in("request_id", manifest.exemptionRequestIds);
    if (grantsResult.error) throw new Error("收集豁免授予夹具失败");
    manifest.exemptionGrantIds = (grantsResult.data ?? []).map((row) => row.id as string);
  }

  const topicIds = argValues("--topic-id");
  if (topicIds.length) {
    assertUuidList(topicIds, "topic_id");
    const claimsResult = await supabase.from("sub_topic_claims").select("id").eq("user_id", userId).in("sub_topic_id", topicIds);
    if (claimsResult.error) throw new Error("收集选题认领夹具失败");
    manifest.claimIds = (claimsResult.data ?? []).map((row) => row.id as string);
  }
  const explicitStoragePaths = argValues("--storage-path");
  if (process.argv.includes("--discover-storage")) {
    const expectedStorageCount = Number(argValue("--storage-count"));
    if (!Number.isInteger(expectedStorageCount) || expectedStorageCount <= 0) {
      throw new Error("--discover-storage 必须同时提供正整数 --storage-count");
    }
    const accountId = await resolveFixtureAccountId(supabase, userId);
    manifest.storagePaths = await discoverFixtureStoragePaths(supabase, userId, accountId, expectedStorageCount);
  } else if (explicitStoragePaths.length) {
    const accountId = await resolveFixtureAccountId(supabase, userId);
    manifest.storagePaths = validateBatch5StoragePaths(explicitStoragePaths, { userId, accountId });
  }

  const allIds = [
    ...manifest.claimIds,
    ...manifest.dailyReportIds,
    ...manifest.videoIds,
    ...manifest.snapshotIds,
    ...manifest.videoTagIds,
    ...manifest.usageRecordIds,
    ...manifest.exemptionRequestIds,
    ...manifest.exemptionGrantIds,
  ];
  assertUuidList(allIds, "夹具清单");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(manifestPath(runId), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(manifestPath(runId), 0o600);
  console.log(`批次5夹具已收集：上传日${manifest.uploadDate}、业务日${manifest.businessDate}；日报${manifest.dailyReportIds.length}、视频${manifest.videoIds.length}、快照${manifest.snapshotIds.length}、标签${manifest.videoTagIds.length}、话术${manifest.usageRecordIds.length}、豁免申请${manifest.exemptionRequestIds.length}、Storage${manifest.storagePaths.length}；清单已写入本地忽略目录。`);
}

function resolveCollectionDatePlan() {
  const uploadDate = argValue("--upload-date");
  const businessDate = argValue("--business-date");
  if (!uploadDate || !businessDate) throw new Error("收集夹具必须同时提供 --upload-date 和 --business-date");
  const expected = buildBatch5DatePlan(uploadDate);
  if (expected.businessDate !== businessDate.trim()) throw new Error("业务日必须是上传日前一天，停止收集");
  return expected;
}

async function deleteExact(
  label: Batch5CleanupResource,
  operation: () => PromiseLike<{ error: { message?: string } | null }>,
) {
  const result = await operation();
  if (result.error) throw new Error(`${label}精确清理失败`);
}

async function assertNoIds(supabase: SupabaseClient, table: string, ids: string[]) {
  if (!ids.length) return;
  const result = await supabase.from(table).select("id").in("id", ids);
  if (result.error) throw new Error(`${table}清理后核验失败`);
  if ((result.data ?? []).length !== 0) throw new Error(`${table}清理后仍有夹具行`);
}

async function assertStoragePathsGone(supabase: SupabaseClient, paths: string[]) {
  for (const objectPath of paths) {
    const pieces = objectPath.split("/");
    const name = pieces.pop();
    if (!name || pieces.length === 0) throw new Error("Storage 路径格式不正确");
    const result = await supabase.storage.from("submission-screenshots").list(pieces.join("/"), { search: name, limit: 100 });
    if (result.error) throw new Error("Storage 清理后核验失败");
    if ((result.data ?? []).some((entry) => entry.name === name)) throw new Error("Storage 清理后仍有夹具对象");
  }
}

async function cleanupManifest(supabase: SupabaseClient, manifestFile: string) {
  const resolvedPath = path.resolve(manifestFile);
  if (!resolvedPath.startsWith(`${OUTPUT_DIR}${path.sep}`)) throw new Error("清理清单必须位于本地批次5输出目录");
  const manifest = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as Manifest;
  const manifestRunId = normalizeBatch5RunId(manifest.runId);
  const requestedRunId = normalizeBatch5RunId(argValue("--run-id"));
  if (manifestRunId !== requestedRunId) throw new Error("清单 run_id 与命令参数不一致，停止清理");
  const uuidGroups = [
    ["claimIds", manifest.claimIds],
    ["dailyReportIds", manifest.dailyReportIds],
    ["videoIds", manifest.videoIds],
    ["snapshotIds", manifest.snapshotIds],
    ["videoTagIds", manifest.videoTagIds],
    ["usageRecordIds", manifest.usageRecordIds],
    ["exemptionRequestIds", manifest.exemptionRequestIds],
    ["exemptionGrantIds", manifest.exemptionGrantIds],
  ] as const;
  for (const [label, ids] of uuidGroups) assertUuidList(ids, label);

  if (!Array.isArray(manifest.storagePaths)) throw new Error("Storage 清单格式不正确，停止清理");
  if (manifest.storagePaths.length) {
    const userId = await resolveFixtureUserId(supabase);
    const accountId = await resolveFixtureAccountId(supabase, userId);
    manifest.storagePaths = validateBatch5StoragePaths(manifest.storagePaths, { userId, accountId });
  }

  await deleteExact("script_usage_records", () => manifest.usageRecordIds.length
    ? supabase.from("script_usage_records").delete().in("id", manifest.usageRecordIds)
    : Promise.resolve({ error: null }));
  await assertNoIds(supabase, "script_usage_records", manifest.usageRecordIds);

  await deleteExact("video_tags", () => manifest.videoTagIds.length
    ? supabase.from("video_tags").delete().in("id", manifest.videoTagIds)
    : Promise.resolve({ error: null }));
  await assertNoIds(supabase, "video_tags", manifest.videoTagIds);

  await deleteExact("video_metrics_snapshots", () => manifest.snapshotIds.length
    ? supabase.from("video_metrics_snapshots").delete().in("id", manifest.snapshotIds)
    : Promise.resolve({ error: null }));
  await assertNoIds(supabase, "video_metrics_snapshots", manifest.snapshotIds);

  await deleteExact("videos", () => manifest.videoIds.length
    ? supabase.from("videos").delete().in("id", manifest.videoIds)
    : Promise.resolve({ error: null }));
  await assertNoIds(supabase, "videos", manifest.videoIds);

  await deleteExact("daily_reports", () => manifest.dailyReportIds.length
    ? supabase.from("daily_reports").delete().in("id", manifest.dailyReportIds)
    : Promise.resolve({ error: null }));
  await assertNoIds(supabase, "daily_reports", manifest.dailyReportIds);

  await deleteExact("exemption_grants", () => manifest.exemptionGrantIds.length
    ? supabase.from("exemption_grant").delete().in("id", manifest.exemptionGrantIds)
    : Promise.resolve({ error: null }));
  await assertNoIds(supabase, "exemption_grant", manifest.exemptionGrantIds);

  await deleteExact("exemption_requests", () => manifest.exemptionRequestIds.length
    ? supabase.from("exemption_request").delete().in("id", manifest.exemptionRequestIds)
    : Promise.resolve({ error: null }));
  await assertNoIds(supabase, "exemption_request", manifest.exemptionRequestIds);

  if (manifest.storagePaths.length) {
    const result = await supabase.storage.from("submission-screenshots").remove(manifest.storagePaths);
    if (result.error) throw new Error("Storage 精确清理失败");
  }
  await assertStoragePathsGone(supabase, manifest.storagePaths);

  if (manifest.claimIds.length) {
    const claimResult = await supabase.from("sub_topic_claims").select("id, status").in("id", manifest.claimIds);
    if (claimResult.error) throw new Error("认领归还后核验失败");
    if ((claimResult.data ?? []).some((row) => row.status === "candidate" || row.status === "scripting")) {
      throw new Error("仍有活动认领，禁止结束清理");
    }
  }
  console.log(`批次5精确清理通过：${BATCH5_CLEANUP_ORDER.join(" → ")}；认领仅核对为非活动状态，未直接删除。`);
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    console.log(`批次5清理 dry-run：${BATCH5_CLEANUP_ORDER.join(" → ")}；不读取、不删除远端数据。`);
    return;
  }
  const { url, key } = requireConfiguration();
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = normalizeBatch5RunId(argValue("--run-id"));
  if (process.argv.includes("--collect")) {
    await collectManifest(supabase, runId, resolveCollectionDatePlan());
    return;
  }
  if (process.argv.includes("--cleanup")) {
    const manifestFile = argValue("--manifest") || manifestPath(runId);
    await cleanupManifest(supabase, manifestFile);
    return;
  }
  throw new Error("请明确指定 --collect 或 --cleanup");
}

main().catch(() => {
  console.error("批次5夹具清单操作失败；未输出凭据、Token 或 Auth ID。");
  process.exitCode = 1;
});
