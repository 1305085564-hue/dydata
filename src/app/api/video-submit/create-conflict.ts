export type CreateSubmissionConflictInput = {
  mode: "create" | "edit" | "abnormal";
  existingReportWithSameVideo: boolean;
  existingVideo: boolean;
};

export type CreateSubmissionConflict = {
  status: 409;
  error: "该作品已录入，请勿重复提交";
};

export function resolveCreateSubmissionConflict(
  input: CreateSubmissionConflictInput,
): CreateSubmissionConflict | null {
  if (input.mode === "edit") return null;
  if (!input.existingReportWithSameVideo && !input.existingVideo) return null;

  return {
    status: 409,
    error: "该作品已录入，请勿重复提交",
  };
}
