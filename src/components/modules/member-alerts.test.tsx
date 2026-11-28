import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemberAlerts } from "./member-alerts";

for (const createdAt of ["2026-11-27T16:30:00.000Z", "2026-11-27T23:59:00.000Z", "2026-11-28"]) {
  test(`成员提醒按北京时间显示申请日期：${createdAt}`, () => {
    const noop = () => {};
    const html = renderToStaticMarkup(<MemberAlerts
      activeCount={1} headlineTeams={[]} unassignedCount={0} onShowUnassigned={noop}
      pendingRequests={[{ id: "request", applicantUserId: "member", applicantName: "张三", applicantEmail: null, targetTeamId: "team", targetTeamName: "一组", createdAt }]}
      canManageMembers={true} isPending={false} handleReviewJoinRequest={noop}
      orphanExemptionCount={0} isCompanyOwner={false} orphanExemptionRequests={[]}
      localTeams={[]} handleAssignOrphanMember={noop} handleRejectOrphanRequest={noop}
    />);
    assert.match(html, />11月28日</);
    assert.doesNotMatch(html, /11月27日/);
  });
}
