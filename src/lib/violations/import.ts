import * as XLSX from "xlsx";

import { isCasePlatform, normalizeOptionalText } from "./api";

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

export function parseViolationImportWorkbook(
  input: Buffer | ArrayBuffer,
  context: { submittedBy: string; teamId: string | null },
): ParsedViolationImport {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("导入文件缺少工作表");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  const parsedRows: ImportedViolationInsertRow[] = [];
  const errors: ImportErrorItem[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const row = rows[index] ?? [];
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
