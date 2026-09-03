import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TOPIC_HOOK_MAX_LENGTH,
  TOPIC_IMPORT_OUTLINE_MAX_LENGTH,
  TOPIC_IMPORT_TITLE_MAX_LENGTH,
  validateTextBoundary,
} from "@/lib/input-boundaries";

export const TOPIC_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const TOPIC_IMPORT_MAX_ROWS = 500;
export const TOPIC_IMPORT_ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_METRIC_VALUE = 1_000_000_000_000;

export type TopicImportRawRow = Record<string, string>;

export type TopicImportParsedRow = {
  rowNumber: number;
  topicName: string;
  title: string;
  durationText: string | null;
  durationSeconds: number | null;
  historyPlay: number | null;
  historyLikes: number | null;
  hook: string | null;
  outline: string | null;
  status: "valid" | "warning" | "error";
  message: string | null;
};

export type TopicImportSummary = {
  totalCount: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  errors: Array<{ rowNumber: number; title: string; reason: string }>;
};

export type TopicImportExecutionResult = {
  successCount: number;
  skippedCount: number;
  failedCount: number;
  errors: Array<{ rowNumber: number; title: string; reason: string }>;
};

const HEADER_ALIASES: Record<string, string[]> = {
  topicName: ["母题", "分类", "母题分类", "主题"],
  title: ["选题标题", "标题", "选题", "题目", "选题名称"],
  duration: ["视频时长", "时长", "时长秒", "秒数", "视频时长秒"],
  historyPlay: ["外部历史播放", "历史播放", "播放量", "外部播放", "外部播放量"],
  historyLikes: ["外部点赞", "点赞", "点赞数", "外部点赞数"],
  hook: ["hook", "钩子", "开头钩子", "hook文案"],
  outline: ["内容提纲", "提纲", "大纲", "内容大纲"],
};

function normalizeHeaderKey(header: string) {
  return header.trim().toLowerCase().replace(/[\s（）():：、,，.。]/g, "");
}

/** 去掉以 = 开头的公式符号，防止导入值在后续导出场景变成公式注入。 */
function sanitizeCellText(value: unknown): { text: string; sanitized: boolean } {
  if (value === null || value === undefined) return { text: "", sanitized: false };
  const raw = typeof value === "string" ? value : String(value);
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (cleaned.startsWith("=")) {
    return { text: cleaned.slice(1).trim(), sanitized: true };
  }
  return { text: cleaned, sanitized: false };
}

export function decodeImportCsv(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("gb18030").decode(buffer);
  } catch {
    return utf8;
  }
}

export function parseTopicImportFile(
  buffer: Buffer,
  fileName: string,
): { ok: true; rows: TopicImportRawRow[] } | { ok: false; status: number; message: string } {
  const lowerName = fileName.toLowerCase();
  const extension = TOPIC_IMPORT_ALLOWED_EXTENSIONS.find((ext) => lowerName.endsWith(ext));
  if (!extension) {
    return { ok: false, status: 400, message: "仅支持 .xlsx、.xls、.csv 文件" };
  }
  if (buffer.byteLength > TOPIC_IMPORT_MAX_FILE_BYTES) {
    return { ok: false, status: 413, message: "文件过大，请控制在 2MB 以内" };
  }
  if (buffer.byteLength === 0) {
    return { ok: false, status: 400, message: "文件内容为空" };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = extension === ".csv"
      ? XLSX.read(decodeImportCsv(buffer), { type: "string" })
      : XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { ok: false, status: 400, message: "文件解析失败，请确认文件未损坏且格式正确" };
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    return { ok: false, status: 400, message: "文件中没有可解析的工作表" };
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  if (!rawRows.length) {
    return { ok: false, status: 400, message: "文件中没有数据行" };
  }
  if (rawRows.length > TOPIC_IMPORT_MAX_ROWS) {
    return { ok: false, status: 413, message: `单次最多导入 ${TOPIC_IMPORT_MAX_ROWS} 行，请拆分文件` };
  }

  const rows: TopicImportRawRow[] = rawRows.map((row) => {
    const normalized: TopicImportRawRow = {};
    for (const [header, value] of Object.entries(row)) {
      normalized[normalizeHeaderKey(header)] = sanitizeCellText(value).text;
    }
    return normalized;
  });
  return { ok: true, rows };
}

function pickSanitizedField(row: TopicImportRawRow, aliases: string[]): { value: string; sanitized: boolean } {
  for (const alias of aliases) {
    const raw = row[normalizeHeaderKey(alias)];
    if (raw !== undefined && raw !== "") {
      const sanitized = sanitizeCellText(raw);
      return { value: sanitized.text, sanitized: sanitized.sanitized };
    }
  }
  return { value: "", sanitized: false };
}

export function parseDurationSeconds(input: string): { ok: true; seconds: number } | { ok: false } {
  const text = input.trim();
  if (!text) return { ok: false };
  const patterns: Array<[RegExp, (match: RegExpMatchArray) => number]> = [
    [/^(\d+)$/, (match) => Number(match[1])],
    [/^(\d+)\s*秒?$/i, (match) => Number(match[1])],
    [/^(\d+)\s*分\s*(?:(\d+)\s*秒)?$/, (match) => Number(match[1]) * 60 + Number(match[2] ?? 0)],
    [/^(\d+):([0-5]?\d)$/, (match) => Number(match[1]) * 60 + Number(match[2])],
  ];
  for (const [pattern, toSeconds] of patterns) {
    const match = text.match(pattern);
    if (match) {
      const seconds = toSeconds(match);
      if (Number.isInteger(seconds) && seconds > 0 && seconds <= MAX_DURATION_SECONDS) {
        return { ok: true, seconds };
      }
      return { ok: false };
    }
  }
  return { ok: false };
}

export function parseMetricValue(input: string): { ok: boolean; value: number | null } {
  const text = input.trim().replace(/[,，\s]/g, "");
  if (!text) return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, value: null };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > MAX_METRIC_VALUE) return { ok: false, value: null };
  return { ok: true, value };
}

export function buildParsedImportRows(
  rawRows: TopicImportRawRow[],
  topicIdByName: Map<string, string>,
): TopicImportParsedRow[] {
  return rawRows.map((row, index) => {
    const rowNumber = index + 2; // 第 1 行是表头
    const errors: string[] = [];
    const warnings: string[] = [];

    const topicPick = pickSanitizedField(row, HEADER_ALIASES.topicName);
    const titlePick = pickSanitizedField(row, HEADER_ALIASES.title);
    const durationPick = pickSanitizedField(row, HEADER_ALIASES.duration);
    const playPick = pickSanitizedField(row, HEADER_ALIASES.historyPlay);
    const likesPick = pickSanitizedField(row, HEADER_ALIASES.historyLikes);
    const hookPick = pickSanitizedField(row, HEADER_ALIASES.hook);
    const outlinePick = pickSanitizedField(row, HEADER_ALIASES.outline);
    if ([topicPick, titlePick, durationPick, playPick, likesPick, hookPick, outlinePick].some((pick) => pick.sanitized)) {
      warnings.push("已清除单元格中的公式符号");
    }

    const topicName = topicPick.value.trim();
    if (!topicName) {
      errors.push("母题不能为空");
    } else if (!topicIdByName.has(topicName)) {
      errors.push("母题必须与现有八大母题完全一致");
    }

    const titleResult = validateTextBoundary({
      label: "选题标题",
      value: titlePick.value,
      maxLength: TOPIC_IMPORT_TITLE_MAX_LENGTH,
      required: true,
    });
    if (!titleResult.ok) errors.push(titleResult.error);
    const rawTitle = titleResult.ok ? titleResult.data ?? "" : titlePick.value.trim();

    const durationText = durationPick.value;
    let durationSeconds: number | null = null;
    if (durationText) {
      const duration = parseDurationSeconds(durationText);
      if (!duration.ok) {
        errors.push("视频时长格式不正确（支持秒数、N分M秒、M:SS）");
      } else {
        durationSeconds = duration.seconds;
      }
    } else {
      warnings.push("未填写视频时长");
    }

    const play = parseMetricValue(playPick.value);
    if (!play.ok) errors.push("外部历史播放必须是有效数字");
    const likes = parseMetricValue(likesPick.value);
    if (!likes.ok) errors.push("外部点赞必须是有效数字");

    if (!durationText && !playPick.value && !likesPick.value) {
      warnings.push("未提供任何成绩数据，仅作为选题参考保存");
    }

    const hookResult = validateTextBoundary({
      label: "hook",
      value: hookPick.value,
      maxLength: TOPIC_HOOK_MAX_LENGTH,
    });
    if (!hookResult.ok) errors.push(hookResult.error);
    const outlineResult = validateTextBoundary({
      label: "内容提纲",
      value: outlinePick.value,
      maxLength: TOPIC_IMPORT_OUTLINE_MAX_LENGTH,
    });
    if (!outlineResult.ok) errors.push(outlineResult.error);
    const hook = hookResult.ok ? hookResult.data : null;
    const outline = outlineResult.ok ? outlineResult.data : null;

    const status = errors.length ? "error" : warnings.length ? "warning" : "valid";
    const message = [...errors, ...warnings].join("；") || null;

    return {
      rowNumber,
      topicName,
      title: rawTitle,
      durationText: durationText || null,
      durationSeconds,
      historyPlay: play.value,
      historyLikes: likes.value,
      hook,
      outline,
      status,
      message,
    } satisfies TopicImportParsedRow;
  });
}

export function buildImportSummary(rows: TopicImportParsedRow[]): TopicImportSummary {
  const errors = rows
    .filter((row) => row.status === "error")
    .map((row) => ({ rowNumber: row.rowNumber, title: row.title, reason: row.message ?? "校验未通过" }));
  return {
    totalCount: rows.length,
    validCount: rows.filter((row) => row.status === "valid").length,
    warningCount: rows.filter((row) => row.status === "warning").length,
    errorCount: errors.length,
    errors,
  };
}

export async function loadTopicNameMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("topics").select("id, name");
  if (error) throw new Error(`加载母题失败：${error.message}`);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
    map.set(row.name.trim(), row.id);
  }
  return map;
}

function dedupeKey(topicId: string, title: string) {
  return `${topicId}::${title.trim().toLowerCase()}`;
}

/**
 * 服务端执行导入。客户端传来的行会被完整重新校验，绝不信任预览状态。
 * 重复项只跳过提示，不覆盖旧数据；部分失败时保留成功行并逐行回报原因。
 */
export async function executeTopicImport(
  supabase: SupabaseClient,
  input: { rows: TopicImportParsedRow[]; adminId: string; fileName: string | null },
): Promise<TopicImportExecutionResult> {
  const errors: TopicImportExecutionResult["errors"] = [];
  let failedCount = 0;
  let skippedCount = 0;
  let successCount = 0;

  const topicIdByName = await loadTopicNameMap(supabase);

  // 服务端完整重新校验
  const revalidated = buildParsedImportRows(
    input.rows.map((row) => ({
      "母题": row.topicName ?? "",
      "选题标题": row.title ?? "",
      "视频时长": row.durationText ?? "",
      "外部历史播放": row.historyPlay === null || row.historyPlay === undefined ? "" : String(row.historyPlay),
      "外部点赞": row.historyLikes === null || row.historyLikes === undefined ? "" : String(row.historyLikes),
      "hook": row.hook ?? "",
      "内容提纲": row.outline ?? "",
    })),
    topicIdByName,
  ).map((row, index) => ({ ...row, rowNumber: input.rows[index]?.rowNumber ?? row.rowNumber }));

  const validRows: Array<TopicImportParsedRow & { topicId: string }> = [];
  const seenInBatch = new Map<string, number>();
  for (const row of revalidated) {
    const title = row.title;
    if (row.status === "error") {
      failedCount += 1;
      errors.push({ rowNumber: row.rowNumber, title, reason: row.message ?? "校验未通过" });
      continue;
    }
    const topicId = topicIdByName.get(row.topicName);
    if (!topicId) {
      failedCount += 1;
      errors.push({ rowNumber: row.rowNumber, title, reason: "母题与现有八大母题不匹配" });
      continue;
    }
    const key = dedupeKey(topicId, title);
    const firstRowNumber = seenInBatch.get(key);
    if (firstRowNumber !== undefined) {
      skippedCount += 1;
      errors.push({ rowNumber: row.rowNumber, title, reason: `与本次导入第 ${firstRowNumber} 行重复，已跳过` });
      continue;
    }
    seenInBatch.set(key, row.rowNumber);
    validRows.push({ ...row, topicId });
  }

  if (validRows.length) {
    // 与数据库已有选题去重：同母题同标题（大小写/空白不敏感）视为重复，只跳过不覆盖
    const topicIds = [...new Set(validRows.map((row) => row.topicId))];
    const titles = [...new Set(validRows.map((row) => row.title))];
    const { data: existingRows, error: existingError } = await supabase
      .from("sub_topics")
      .select("id, topic_id, title")
      .in("topic_id", topicIds)
      .in("title", titles);
    if (existingError) throw new Error(`查询已有选题失败：${existingError.message}`);
    const existingKeys = new Set(
      ((existingRows ?? []) as Array<{ topic_id: string; title: string }>).map((row) =>
        dedupeKey(row.topic_id, row.title),
      ),
    );

    const pending: Array<TopicImportParsedRow & { topicId: string }> = [];
    for (const row of validRows) {
      if (existingKeys.has(dedupeKey(row.topicId, row.title))) {
        skippedCount += 1;
        errors.push({ rowNumber: row.rowNumber, title: row.title, reason: "已存在相同母题下的相同标题，已跳过（不覆盖旧数据）" });
        continue;
      }
      pending.push(row);
    }

    if (pending.length) {
      const { data: batch, error: batchError } = await supabase
        .from("topic_import_batches")
        .insert({
          created_by: input.adminId,
          file_name: input.fileName,
          total_rows: input.rows.length,
        })
        .select("id")
        .single();
      if (batchError || !batch) throw new Error(`创建导入批次失败：${batchError?.message ?? "未知错误"}`);
      const batchId = (batch as { id: string }).id;

      const payload = pending.map((row) => ({
        title: row.title,
        hook: row.hook ?? "",
        outline: row.outline,
        topic_id: row.topicId,
        group_id: null,
        source: "external_import",
        source_type: "external" as const,
        library_status: "in_library" as const,
        duration_seconds: row.durationSeconds,
        external_play_count: row.historyPlay,
        external_like_count: row.historyLikes,
        external_sample_count: 1,
        import_batch_id: batchId,
        created_by: input.adminId,
      }));

      let insertError: { message: string } | null = null;
      let insertedCount = 0;
      const { error: batchInsertError } = await supabase.from("sub_topics").insert(payload);
      if (batchInsertError) {
        // 整批失败时逐行重试，保证部分成功可解释
        for (const row of payload) {
          const { error: singleError } = await supabase.from("sub_topics").insert(row);
          if (singleError) {
            insertError = singleError;
          } else {
            insertedCount += 1;
          }
        }
      } else {
        insertedCount = payload.length;
      }

      const pendingFailed = pending.length - insertedCount;
      if (insertError && pendingFailed > 0) {
        failedCount += pendingFailed;
        errors.push({
          rowNumber: 0,
          title: "-",
          reason: `部分数据写入失败：${insertError.message}`,
        });
      }
      successCount = insertedCount;

      await supabase
        .from("topic_import_batches")
        .update({
          success_count: insertedCount,
          skipped_count: skippedCount,
          failed_count: failedCount,
        })
        .eq("id", batchId);
    }
  }

  return { successCount, skippedCount, failedCount, errors };
}
