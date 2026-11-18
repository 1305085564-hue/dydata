export type DailyReportOnlyEditAccount = { id: string; profile_id: string };
export type DailyReportOnlyEditReport = {
  id: string;
  user_id: string;
  account_id: string;
  report_date: string;
  video_id: string | null;
  published_at: string | null;
  is_void: boolean;
};

export type DailyReportOnlyEditAssignees = Record<
  "script_author_user_id" | "video_editor_user_id" | "operator_user_id",
  string | null
>;

const DAILY_REPORT_ASSIGNEE_FIELDS = [
  "script_author_user_id",
  "video_editor_user_id",
  "operator_user_id",
] as const;

export function findChangedExternalDailyReportAssigneeIds(input: {
  assignees: DailyReportOnlyEditAssignees;
  originalAssignees: DailyReportOnlyEditAssignees;
  actorId: string;
}) {
  return DAILY_REPORT_ASSIGNEE_FIELDS
    .filter((field) => {
      const id = input.assignees[field];
      return Boolean(id && id !== input.actorId && id !== input.originalAssignees[field]);
    })
    .map((field) => input.assignees[field] as string);
}

export function resolveDailyReportOnlyEditAccessError(input: {
  actorId: string;
  accountId: string;
  reportId: string;
  reportDate: string;
  account: DailyReportOnlyEditAccount | null;
  report: DailyReportOnlyEditReport | null;
}) {
  if (!input.account || input.account.id !== input.accountId || input.account.profile_id !== input.actorId) {
    return "账号不存在或无权限修改";
  }
  const report = input.report;
  if (
    !report ||
    report.id !== input.reportId ||
    report.user_id !== input.actorId ||
    report.account_id !== input.accountId ||
    report.report_date !== input.reportDate ||
    report.is_void ||
    report.video_id
  ) {
    return "这条日报与当前账号或日期不一致，或已关联作品，请重新打开修改";
  }
  return null;
}
