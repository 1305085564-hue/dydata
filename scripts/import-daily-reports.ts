import { existsSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

type RawRow = Record<string, unknown>;

type FieldCell = {
  key: string;
  value: unknown;
};

type MatchedField = {
  alias: string;
  value: unknown;
};

type ReportPayload = {
  user_id: string;
  report_date: string;
  title: string;
  submitter: string;
  play_count: number;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  content: string | null;
  published_at: string | null;
};

type ParsedArgs = {
  filePath: string;
  dryRun: boolean;
};

type MatchResult =
  | { status: "matched"; profileId: string; submitter: string }
  | { status: "unmatched"; reason: string };

type PreparedRow = {
  rowNumber: number;
  report: ReportPayload;
};

const REQUIRED_FIELDS = ["submitter", "report_date", "title"] as const;
const BATCH_SIZE = 500;

const FIELD_ALIASES: Record<string, string[]> = {
  submitter: ["提交人", "姓名", "作者", "员工", "成员", "昵称", "name", "submitter", "user", "用户"],
  report_date: ["日期", "日报日期", "提交日期", "report_date", "date", "day"],
  title: ["标题", "视频标题", "作品标题", "内容标题", "title", "subject"],
  play_count: ["播放量", "播放量(万)", "播放", "播放数", "play_count", "views"],
  completion_rate: ["完播率", "completion_rate"],
  avg_play_duration: ["平均播放时长", "平均播放", "avg_play_duration", "播放时长"],
  bounce_rate_2s: ["2s跳出率", "2秒跳出率", "bounce_rate_2s"],
  completion_rate_5s: ["5s完播率", "5秒完播率", "completion_rate_5s"],
  likes: ["点赞", "点赞数", "likes"],
  comments: ["评论", "评论数", "comments"],
  shares: ["分享", "分享数", "shares"],
  favorites: ["收藏", "收藏数", "favorites"],
  content: ["文案", "文案内容", "内容", "正文", "content"],
  published_at: ["发布时间", "发布时刻", "published_at", "publish_time", "发布时间间"],
};

const NAME_ALIAS_MAP: Record<string, string> = {};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function parseArgs(argv: string[]): ParsedArgs {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const dryRun = argv.includes("--dry-run");

  if (positional.length === 0) {
    console.error("Usage: npm run import:reports -- <file-path> [--dry-run]");
    process.exit(1);
  }

  const filePath = path.resolve(positional[0]);

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  return { filePath, dryRun };
}

function normalizeKey(value: string): string {
  return value.replace(/\u3000/g, " ").replace(/\s+/g, "").trim().toLowerCase();
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).replace(/\u3000/g, " ").trim();
  return text === "" ? null : text;
}

function normalizeName(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const canonical = NAME_ALIAS_MAP[text] ?? text;
  return canonical.replace(/\s+/g, "");
}

function getNormalizedCells(row: RawRow): FieldCell[] {
  return Object.entries(row).map(([key, value]) => ({
    key: normalizeKey(key),
    value,
  }));
}

function getFieldValue(cells: FieldCell[], field: keyof typeof FIELD_ALIASES): unknown {
  return getMatchedField(cells, field)?.value;
}

function getMatchedField(cells: FieldCell[], field: keyof typeof FIELD_ALIASES): MatchedField | null {
  for (const alias of FIELD_ALIASES[field]) {
    const matched = cells.find((cell) => cell.key === normalizeKey(alias));
    if (matched) {
      return { alias, value: matched.value };
    }
  }

  return null;
}

function assertRequiredColumns(rows: RawRow[]) {
  if (rows.length === 0) {
    throw new Error("文件中没有可导入的数据行");
  }

  const missingFields = REQUIRED_FIELDS.filter((field) =>
    rows.every((row) => {
      const cells = getNormalizedCells(row);
      return getFieldValue(cells, field) === undefined;
    })
  );

  if (missingFields.length > 0) {
    throw new Error(`缺少关键列: ${missingFields.join(", ")}`);
  }
}

function parseWorkbook(filePath: string): RawRow[] {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("未找到工作表");
  }

  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<RawRow>(sheet, {
    defval: null,
    raw: true,
  });
}

function toDateString(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
    }
  }

  const text = normalizeText(value);
  if (!text) return null;

  const normalized = text.replace(/[年./]/g, "-").replace(/月/g, "-").replace(/日/g, "").replace(/\s+/g, " ");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function toIsoDateTime(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S)).toISOString();
    }
  }

  const text = normalizeText(value);
  if (!text) return null;

  const normalized = text.replace(/[年./]/g, "-").replace(/月/g, "-").replace(/日/g, "");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function toInteger(value: unknown, mode: "plain" | "wan" = "plain"): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * (mode === "wan" ? 10000 : 1));
  }

  const text = normalizeText(value);
  if (!text) return 0;

  const cleaned = text.replace(/[，,]/g, "");
  const treatAsWan = cleaned.includes("万");
  const numeric = Number(cleaned.replace(/万/g, ""));

  if (Number.isNaN(numeric)) {
    return 0;
  }

  return Math.round(numeric * (treatAsWan || mode === "wan" ? 10000 : 1));
}

function toPercentText(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  return text.endsWith("%") ? text : `${text}%`;
}

function toDurationText(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  if (/[时分秒sS分钟小时]/.test(text)) {
    return text.replace(/seconds?/i, "s").replace(/secs?/i, "s");
  }

  return `${text}秒`;
}

function buildProfileIndex(profiles: Array<{ id: string; name: string }>) {
  const index = new Map<string, { id: string; name: string }>();
  const duplicates = new Set<string>();

  for (const profile of profiles) {
    const key = normalizeName(profile.name);
    if (!key) continue;

    if (index.has(key)) {
      duplicates.add(profile.name);
      continue;
    }

    index.set(key, profile);
  }

  return { index, duplicates: [...duplicates] };
}

function matchProfile(rawName: unknown, profileIndex: Map<string, { id: string; name: string }>): MatchResult {
  const normalized = normalizeName(rawName);
  if (!normalized) {
    return { status: "unmatched", reason: "缺少提交人" };
  }

  const profile = profileIndex.get(normalized);
  if (!profile) {
    return { status: "unmatched", reason: `未匹配到 profiles.name: ${normalized}` };
  }

  return { status: "matched", profileId: profile.id, submitter: profile.name };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function dedupePreparedRows(rows: PreparedRow[]) {
  const deduped = new Map<string, PreparedRow>();

  for (const row of rows) {
    const key = `${row.report.user_id}::${row.report.report_date}`;
    deduped.set(key, row);
  }

  return [...deduped.values()];
}

async function countExistingConflicts(rows: PreparedRow[]) {
  const userIds = [...new Set(rows.map((row) => row.report.user_id))];
  const reportDates = [...new Set(rows.map((row) => row.report.report_date))];

  if (userIds.length === 0 || reportDates.length === 0) {
    return 0;
  }

  const conflictKeys = new Set(rows.map((row) => `${row.report.user_id}::${row.report.report_date}`));
  let existingCount = 0;

  for (const userChunk of chunkArray(userIds, BATCH_SIZE)) {
    for (const dateChunk of chunkArray(reportDates, BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("user_id, report_date")
        .in("user_id", userChunk)
        .in("report_date", dateChunk);

      if (error) {
        throw new Error(`查询现有日报失败: ${error.message}`);
      }

      for (const item of data ?? []) {
        const key = `${item.user_id}::${item.report_date}`;
        if (conflictKeys.has(key)) {
          existingCount += 1;
        }
      }
    }
  }

  return existingCount;
}

async function upsertReports(rows: PreparedRow[]) {
  for (const chunk of chunkArray(rows, BATCH_SIZE)) {
    const payload = chunk.map((row) => row.report);
    const { error } = await supabase.from("daily_reports").upsert(payload, {
      onConflict: "user_id,report_date",
    });

    if (error) {
      throw new Error(`导入失败: ${error.message}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawRows = parseWorkbook(args.filePath);
  assertRequiredColumns(rawRows);

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, name");

  if (profilesError) {
    throw new Error(`读取 profiles 失败: ${profilesError.message}`);
  }

  const { index: profileIndex, duplicates } = buildProfileIndex(profiles ?? []);

  if (duplicates.length > 0) {
    console.warn(`警告: profiles.name 存在重名，导入按首个匹配处理: ${duplicates.join(", ")}`);
  }

  const preparedRows: PreparedRow[] = [];
  const skippedRows: Array<{ rowNumber: number; reason: string }> = [];
  const unmatchedNames = new Set<string>();

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const cells = getNormalizedCells(row);
    const title = normalizeText(getFieldValue(cells, "title"));
    const reportDate = toDateString(getFieldValue(cells, "report_date"));
    const matchedProfile = matchProfile(getFieldValue(cells, "submitter"), profileIndex);

    if (!title || !reportDate) {
      throw new Error(`第 ${rowNumber} 行缺少关键值: title 或 report_date`);
    }

    if (matchedProfile.status === "unmatched") {
      const rawName = normalizeText(getFieldValue(cells, "submitter")) ?? "(空)";
      unmatchedNames.add(rawName);
      skippedRows.push({ rowNumber, reason: matchedProfile.reason });
      return;
    }

    const playCountField = getMatchedField(cells, "play_count");

    preparedRows.push({
      rowNumber,
      report: {
        user_id: matchedProfile.profileId,
        report_date: reportDate,
        title,
        submitter: matchedProfile.submitter,
        play_count: toInteger(playCountField?.value, playCountField?.alias === "播放量(万)" ? "wan" : "plain"),
        completion_rate: toPercentText(getFieldValue(cells, "completion_rate")),
        avg_play_duration: toDurationText(getFieldValue(cells, "avg_play_duration")),
        bounce_rate_2s: toPercentText(getFieldValue(cells, "bounce_rate_2s")),
        completion_rate_5s: toPercentText(getFieldValue(cells, "completion_rate_5s")),
        likes: toInteger(getFieldValue(cells, "likes")),
        comments: toInteger(getFieldValue(cells, "comments")),
        shares: toInteger(getFieldValue(cells, "shares")),
        favorites: toInteger(getFieldValue(cells, "favorites")),
        content: normalizeText(getFieldValue(cells, "content")),
        published_at: toIsoDateTime(getFieldValue(cells, "published_at")),
      },
    });
  });

  if (preparedRows.length === 0) {
    console.log("没有可导入的数据。未匹配行已全部跳过。");
    console.log(`总行数: ${rawRows.length}`);
    console.log(`跳过行数: ${skippedRows.length}`);
    if (unmatchedNames.size > 0) {
      console.log(`未匹配名单: ${[...unmatchedNames].join(", ")}`);
    }
    return;
  }

  const dedupedRows = dedupePreparedRows(preparedRows);
  const duplicateKeysInFile = preparedRows.length - dedupedRows.length;
  const conflictOverwriteCount = await countExistingConflicts(dedupedRows);

  if (args.dryRun) {
    console.log("Dry run completed. No data written.");
  } else {
    await upsertReports(dedupedRows);
    console.log("导入完成。");
  }

  console.log(`文件: ${args.filePath}`);
  console.log(`总行数: ${rawRows.length}`);
  console.log(`成功匹配: ${dedupedRows.length}`);
  console.log(`跳过行数: ${skippedRows.length}`);
  console.log(`命中已存在记录: ${conflictOverwriteCount}`);
  console.log(`文件内重复键: ${duplicateKeysInFile}`);

  if (skippedRows.length > 0) {
    console.log("跳过明细:");
    skippedRows.forEach((item) => {
      console.log(`  - 第 ${item.rowNumber} 行: ${item.reason}`);
    });
  }

  if (unmatchedNames.size > 0) {
    console.log(`未匹配名单: ${[...unmatchedNames].join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
