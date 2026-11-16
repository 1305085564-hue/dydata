export type CreateSubmissionConflictInput = {
  mode: "create" | "edit" | "abnormal";
  existingReportWithSameVideo: boolean;
  existingVideo: boolean;
  /** 同账号+同标题+同发布日（上海自然日）已存在活跃视频。内容指纹会因 OCR 微差漂移，业务键判重才是唯一防线。 */
  existingActiveWorkSameDay: boolean;
};

export function buildPublishedDayWindow(publishedAt: string | null): { start: string; end: string } | null {
  if (!publishedAt) return null;
  const ms = new Date(publishedAt).getTime();
  if (Number.isNaN(ms)) return null;
  const shanghai = new Date(ms + 8 * 60 * 60 * 1000);
  const start = Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate()) - 8 * 60 * 60 * 1000;
  return { start: new Date(start).toISOString(), end: new Date(start + 24 * 60 * 60 * 1000).toISOString() };
}

export type CreateSubmissionConflict = {
  status: 409;
  error: "这条已经上传过,无需重复提交";
};

export function resolveCreateSubmissionConflict(
  input: CreateSubmissionConflictInput,
): CreateSubmissionConflict | null {
  if (input.mode === "edit") return null;
  if (!input.existingReportWithSameVideo && !input.existingVideo && !input.existingActiveWorkSameDay) return null;

  return {
    status: 409,
    error: "这条已经上传过,无需重复提交",
  };
}
