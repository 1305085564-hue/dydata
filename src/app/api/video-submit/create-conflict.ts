export type CreateSubmissionConflictInput = {
  mode: "create" | "edit" | "abnormal";
  existingReport: boolean;
  existingVideo: boolean;
};

export type CreateSubmissionConflict = {
  status: 409;
  error: "该账号该业务日已提交，请勿重复提交";
};

export function resolveCreateSubmissionConflict(
  input: CreateSubmissionConflictInput,
): CreateSubmissionConflict | null {
  if (input.mode === "edit") return null;
  if (!input.existingReport && !input.existingVideo) return null;

  return {
    status: 409,
    error: "该账号该业务日已提交，请勿重复提交",
  };
}
