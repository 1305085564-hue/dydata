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
 * 来源判定只看「这次提交里，最终数字是怎么来的」：
 * - 有人手打/手改过数字 → `manual`（最高优先级，换图也洗不掉真实的人工输入）
 * - 没手打，但这次重新上传了截图并识别 → `ai`（换图等于重新取证，历史标记应当让位）
 * - 这次既没手打也没换图 → 原样保留历史来源，不做任何改写
 *
 * 旧版本把「一旦 manual 永远 manual」写死在这里，导致换新截图、OCR 重新识别
 * 之后手工标记仍然洗不掉，已按上述规则改掉。
 */
export function resolveDailyReportDataSource({
  existing,
  hasOcrRecognizedFields,
  hasManualEdit,
  screenshotsRefreshed = false,
}: {
  existing: DailyReportDataSource;
  hasOcrRecognizedFields: boolean;
  hasManualEdit: boolean;
  /** 本次提交是否重新上传过截图。换图会重跑识别，是唯一能打破历史手工标记的动作。 */
  screenshotsRefreshed?: boolean;
}): DailyReportDataSource {
  if (hasManualEdit) return "manual";
  if (screenshotsRefreshed) return "ai";
  if (hasOcrRecognizedFields && existing !== "manual") return "ai";
  return existing;
}
