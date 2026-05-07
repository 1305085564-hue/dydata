import test from "node:test";
import assert from "node:assert/strict";

import { DEMO_VIEWER, demoAccounts, demoProfiles, demoReports } from "./demo-data";

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

test("阿禅的演示主号有 30 天数据，且整体表现略高于团队均值", () => {
  assert.equal(DEMO_VIEWER.name, "阿禅");
  assert.equal(demoProfiles[0]?.name, "阿禅");

  const mainAccount = demoAccounts.find((account) => account.id === "demo-account-01");
  assert.ok(mainAccount);
  assert.equal(mainAccount?.name, "阿禅主号");

  const reports = demoReports.filter((report) => report.account_id === mainAccount?.id);
  assert.equal(reports.length, 30);
  assert.equal(new Set(reports.map((report) => report.report_date)).size, 30);

  const teamAveragePlayCount = average(demoReports.map((report) => report.play_count ?? 0));
  const mainAveragePlayCount = average(reports.map((report) => report.play_count ?? 0));
  assert.ok(mainAveragePlayCount > teamAveragePlayCount);

  const teamAverageCompletion = average(demoReports.map((report) => Number.parseFloat(report.completion_rate ?? "0")));
  const mainAverageCompletion = average(reports.map((report) => Number.parseFloat(report.completion_rate ?? "0")));
  assert.ok(mainAverageCompletion > teamAverageCompletion);
});
