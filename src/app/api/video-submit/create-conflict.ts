export type CreateSubmissionConflictInput = {
  mode: "create" | "edit" | "abnormal";
  existingReportWithSameVideo: boolean;
  existingVideo: boolean;
  /** 同账号+同标题+同发布日（上海自然日）已存在活跃视频。内容指纹会因 OCR 微差漂移，业务键判重才是唯一防线。 */
  existingActiveWorkSameDay: boolean;
};

export type CreateSubmissionConflict = {
  status: 409;
  error: "该作品已录入，请勿重复提交";
};

export function resolveCreateSubmissionConflict(
  input: CreateSubmissionConflictInput,
): CreateSubmissionConflict | null {
  if (input.mode === "edit") return null;
  if (!input.existingReportWithSameVideo && !input.existingVideo && !input.existingActiveWorkSameDay) return null;

  return {
    status: 409,
    error: "该作品已录入，请勿重复提交",
  };
}
