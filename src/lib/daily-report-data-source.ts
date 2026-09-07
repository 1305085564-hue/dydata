export type DailyReportDataSource = "ai" | "manual" | null;

export function normalizeDailyReportDataSource(
  value: unknown,
): DailyReportDataSource {
  return value === "ai" || value === "manual" ? value : null;
}

export function hasActualFieldChange(previous: unknown, next: unknown) {
  return !Object.is(previous, next);
}

/**
 * A source can only become more specific: a hand-edited record remains
 * hand-edited even if OCR later runs again or the record is saved unchanged.
 * Null deliberately represents historical/otherwise unknown provenance.
 */
export function resolveDailyReportDataSource({
  existing,
  hasOcrRecognizedFields,
  hasManualEdit,
}: {
  existing: DailyReportDataSource;
  hasOcrRecognizedFields: boolean;
  hasManualEdit: boolean;
}): DailyReportDataSource {
  if (existing === "manual" || hasManualEdit) return "manual";
  if (existing === "ai" || hasOcrRecognizedFields) return "ai";
  return null;
}
