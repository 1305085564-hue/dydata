import ExcelJS from "exceljs";

import { excelCellValueToScalar, type ExcelScalar } from "@/lib/excel-values";
import { isCasePlatform, normalizeOptionalText } from "./api";

export const MAX_VIOLATION_IMPORT_ROWS = 5_000;
export const MAX_VIOLATION_IMPORT_FILE_SIZE = 2 * 1024 * 1024;
export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export class ViolationImportWorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViolationImportWorkbookError";
  }
}

export function validateViolationImportFile(file: { name: string; type: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith(".xlsx")) return "仅支持 .xlsx 文件";
  if (file.type !== XLSX_MIME_TYPE) return "文件 MIME 类型不是有效的 .xlsx 工作簿";
  if (file.size <= 0 || file.size > MAX_VIOLATION_IMPORT_FILE_SIZE) {
    return "Excel 文件必须大于 0 且不能超过 2MB";
  }
  return null;
}

export type ImportedViolationInsertRow = {
  submitted_by: string;
  team_id: string | null;
  script_text: string;
  is_violation: boolean;
  account_name_snapshot: string | null;
  result: string | null;
  platforms: string[];
  scene_description: string | null;
  status: "submitted";
  purpose: "violation" | "conversion";
  category: "短视频";
};

export type ImportErrorItem = {
  row: number;
  reason: string;
};

export type ParsedViolationImport = {
  rows: ImportedViolationInsertRow[];
  skipped: number;
  errors: ImportErrorItem[];
};

function normalizePlatforms(value: string) {
  const rawItems = value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const normalized = rawItems.filter(isCasePlatform);
  if (normalized.length === 0) {
    return ["抖音"];
  }

  return Array.from(new Set(normalized));
}

function normalizeBooleanCell(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false as const, reason: "违规/可用 不能为空" };
  }

  return { ok: true as const, value: trimmed === "违规" };
}

export async function parseViolationImportWorkbook(
  input: Buffer | ArrayBuffer,
  context: { submittedBy: string; teamId: string | null },
): Promise<ParsedViolationImport> {
  const source = Buffer.isBuffer(input) ? input : new Uint8Array(input);
  const buffer = new Uint8Array(source.byteLength);
  buffer.set(source);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer.buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new ViolationImportWorkbookError("导入文件缺少工作表");
  }
  if (Math.max(0, sheet.rowCount - 1) > MAX_VIOLATION_IMPORT_ROWS) {
    throw new ViolationImportWorkbookError(`Excel 最多支持 ${MAX_VIOLATION_IMPORT_ROWS} 行数据`);
  }

  const parsedRows: ImportedViolationInsertRow[] = [];
  const errors: ImportErrorItem[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const worksheetRow = sheet.getRow(rowNumber);
    const row: ExcelScalar[] = Array.from(
      { length: Math.max(6, sheet.columnCount) },
      (_, index) => excelCellValueToScalar(worksheetRow.getCell(index + 1).value),
    );
    if (row.every((value) => value == null || value === "")) continue;
    const scriptText = String(row[0] ?? "").trim();
    const violationCell = String(row[1] ?? "");

    if (!scriptText) {
      errors.push({ row: rowNumber, reason: "话术原文不能为空" });
      continue;
    }

    const violationState = normalizeBooleanCell(violationCell);
    if (!violationState.ok) {
      errors.push({ row: rowNumber, reason: violationState.reason });
      continue;
    }

    parsedRows.push({
      submitted_by: context.submittedBy,
      team_id: context.teamId,
      script_text: scriptText,
      is_violation: violationState.value,
      account_name_snapshot: normalizeOptionalText(row[2], 200),
      result: normalizeOptionalText(row[3], 200),
      platforms: normalizePlatforms(String(row[4] ?? "")),
      scene_description: normalizeOptionalText(row[5], 3000),
      status: "submitted",
      purpose: violationState.value ? "violation" : "conversion",
      category: "短视频",
    });
  }

  return {
    rows: parsedRows,
    skipped: errors.length,
    errors,
  };
}
