import assert from "node:assert/strict";
import test from "node:test";

import {
  findChangedExternalDailyReportAssigneeIds,
  resolveDailyReportOnlyEditAccessError,
} from "./daily-report-only-edit";

const actorId = "123e4567-e89b-12d3-a456-426614174001";
const accountId = "223e4567-e89b-12d3-a456-426614174002";
const reportId = "423e4567-e89b-12d3-a456-426614174005";
const reportDate = "2026-08-25";

function accessInput(overrides: Record<string, unknown> = {}) {
  return {
    actorId,
    accountId,
    reportId,
    reportDate,
    account: { id: accountId, profile_id: actorId },
    report: {
      id: reportId,
      user_id: actorId,
      account_id: accountId,
      report_date: reportDate,
      video_id: null,
      published_at: null,
      is_void: false,
    },
    ...overrides,
  };
}

test("日报-only 编辑只允许本人账号下指定日期、未作废且没有绑定作品的日报", () => {
  assert.equal(resolveDailyReportOnlyEditAccessError(accessInput()), null);
});

test("旧责任人的豁免按岗位匹配，跨岗位复用同一人仍按新指派校验", () => {
  const externalId = "623e4567-e89b-12d3-a456-426614174007";
  const selfId = actorId;
  const originalAssignees = {
    script_author_user_id: externalId,
    video_editor_user_id: selfId,
    operator_user_id: selfId,
  };
  assert.deepEqual(findChangedExternalDailyReportAssigneeIds({
    assignees: { ...originalAssignees },
    originalAssignees,
    actorId,
  }), []);
  assert.deepEqual(findChangedExternalDailyReportAssigneeIds({
    assignees: { ...originalAssignees, video_editor_user_id: externalId },
    originalAssignees,
    actorId,
  }), [externalId]);
});

test("日报-only 编辑拒绝其他成员的账号或日报", () => {
  assert.match(
    resolveDailyReportOnlyEditAccessError(accessInput({
      account: { id: accountId, profile_id: "523e4567-e89b-12d3-a456-426614174006" },
    })) ?? "",
    /无权限/,
  );
  assert.match(
    resolveDailyReportOnlyEditAccessError(accessInput({
      report: {
        ...accessInput().report,
        user_id: "523e4567-e89b-12d3-a456-426614174006",
      },
    })) ?? "",
    /不一致/,
  );
});

test("日报编号、日期、作废状态和作品绑定任一不符都拒绝日报-only 保存", () => {
  const base = accessInput();
  assert.match(resolveDailyReportOnlyEditAccessError({ ...base, reportId: "other-report" }) ?? "", /不一致/);
  assert.match(resolveDailyReportOnlyEditAccessError({ ...base, reportDate: "2026-08-26" }) ?? "", /不一致/);
  assert.match(
    resolveDailyReportOnlyEditAccessError({
      ...base,
      report: { ...base.report, is_void: true },
    }) ?? "",
    /不一致/,
  );
  assert.match(
    resolveDailyReportOnlyEditAccessError({
      ...base,
      report: { ...base.report, video_id: "323e4567-e89b-12d3-a456-426614174004" },
    }) ?? "",
    /已关联作品/,
  );
});
