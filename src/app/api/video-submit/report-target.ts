type EditReportBinding<TReport> = {
  ok: true;
  dailyReport: TReport;
} | { ok: false };

export function resolveDailyReportSubmissionTarget<TReport>(input: {
  mode: "create" | "edit" | "abnormal";
  editBinding: EditReportBinding<TReport> | null;
}) {
  if (input.mode === "edit" && input.editBinding?.ok) {
    return { action: "update" as const, existingReport: input.editBinding.dailyReport };
  }
  return { action: "insert" as const, existingReport: null as TReport | null };
}
