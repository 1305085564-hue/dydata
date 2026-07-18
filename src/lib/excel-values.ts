import type ExcelJS from "exceljs";

export type ExcelScalar = string | number | boolean | Date | null;

export function excelCellValueToScalar(value: ExcelJS.CellValue | undefined): ExcelScalar {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value;

  if ("result" in value && value.result !== undefined) {
    return excelCellValueToScalar(value.result);
  }
  if ("richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }
  return null;
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MILLISECONDS_PER_DAY = 86_400_000;

export function excelSerialToDate(value: number): Date | null {
  if (!Number.isFinite(value)) return null;
  const timestamp = EXCEL_EPOCH_UTC + Math.round(value * MILLISECONDS_PER_DAY);
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}
