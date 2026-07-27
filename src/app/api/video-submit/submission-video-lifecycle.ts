export type SubmissionVideoWriteMode = "insert" | "update" | "restore_then_update";

export function resolveSubmissionVideoWriteMode(lifecycleState: string | null) {
  if (lifecycleState === "active") return "update";
  if (lifecycleState === "trashed") return "restore_then_update";
  return "insert";
}
