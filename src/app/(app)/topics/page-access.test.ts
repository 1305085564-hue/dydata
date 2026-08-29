import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const pageSource = readFileSync(resolve(process.cwd(), "src/app/(app)/topics/page.tsx"), "utf8");
const detailLayoutSource = readFileSync(resolve(process.cwd(), "src/app/(app)/topics/[id]/layout.tsx"), "utf8");
const dashboardContentSource = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/dashboard-content.tsx"), "utf8");

test("topics 入口在服务端确认 active team membership 后才挂载 TopicHubV2", () => {
  assert.match(pageSource, /getCurrentUserContext/);
  assert.match(pageSource, /membership_status/);
  assert.match(pageSource, /team_id/);
  assert.match(pageSource, /<JoinBanner \/>/);
  assert.match(pageSource, /<TopicHubV2 canManageTopicLibrary=\{canManageTopicLibrary\}( feishuWorkspaceUrl=\{feishuWorkspaceUrl\})? \/>/);
  assert.match(pageSource, /hasCompanyPermission\(permissionContext\.permissionInfo\.companyRole, "review_content"\)/);
  assert.ok(pageSource.indexOf("if (profile?.membership_status !== \"active\" || !profile.team_id)") < pageSource.indexOf("return <TopicHubV2 canManageTopicLibrary={canManageTopicLibrary}"));
});

test("topics 详情页由服务端 layout 拦截未入团访问并回到申请入口", () => {
  assert.match(detailLayoutSource, /membership_status/);
  assert.match(detailLayoutSource, /team_id/);
  assert.match(detailLayoutSource, /redirect\("\/topics\?membership=required"\)/);
});

test("dashboard 未入团时不渲染 VideoSubmitPanelV2", () => {
  assert.match(dashboardContentSource, /hasActiveTeamMembership/);
  assert.match(dashboardContentSource, /if \(!props\.hasActiveTeamMembership\)/);
  assert.ok(dashboardContentSource.indexOf("if (!props.hasActiveTeamMembership)") < dashboardContentSource.indexOf("<ProductionControlSystem"));
});
