import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollaborationSearchParams,
  buildCollaborationUrl,
  COLLABORATION_BASE_PATH,
  pickActiveGroupDetail,
  resolveCollaborationView,
} from "./work-group-navigation";

/**
 * 「按岗位 / 按团队」双模式切换与进组的 URL 契约，以及进组后的详情定位。
 * 这些是真实行为断言（URL 字符串 + 定位结果），不是源码正则。
 */

function parsed(url: string) {
  return Object.fromEntries(new URL(url, "https://dydata.cc").searchParams.entries());
}

const GROUPS = [
  { summary: { id: "wg-writer", name: "文案一组" }, members: [{ userId: "u1" }] },
  { summary: { id: "wg-operator", name: "运营一组" }, members: [] },
];

test("按岗位模式：URL 只带 tab，不带 view，也不残留进组参数", () => {
  const search = buildCollaborationSearchParams({
    year: 2026,
    month: 9,
    view: "roles",
    tab: "writers",
    groupId: "wg-writer",
  });
  assert.equal(search, "year=2026&month=9&tab=writers");
  assert.deepEqual(parsed(`${COLLABORATION_BASE_PATH}?${search}`), {
    year: "2026",
    month: "9",
    tab: "writers",
  });
});

test("按团队列表：URL 带 view=teams 且不带 groupId（返回列表要真的回到列表）", () => {
  const url = buildCollaborationUrl({ year: 2026, month: 9, view: "teams" });
  assert.equal(url, `${COLLABORATION_BASE_PATH}?year=2026&month=9&view=teams`);
  assert.deepEqual(parsed(url), { year: "2026", month: "9", view: "teams" });
});

test("进组：URL 带 view=teams&groupId=，id 被转义，切月仍留在该组", () => {
  const enter = buildCollaborationUrl({ year: 2026, month: 9, view: "teams", groupId: "wg 一组/#1" });
  assert.equal(
    enter,
    `${COLLABORATION_BASE_PATH}?year=2026&month=9&view=teams&groupId=wg+%E4%B8%80%E7%BB%84%2F%231`,
  );
  assert.equal(parsed(enter).groupId, "wg 一组/#1", "转义后可原样解回，进组不会丢 id");

  // 切到上个月：视图与进组 id 都要保留，只换年月
  const prevMonth = buildCollaborationUrl({ year: 2026, month: 8, view: "teams", groupId: "wg-writer" });
  assert.deepEqual(parsed(prevMonth), {
    year: "2026",
    month: "8",
    view: "teams",
    groupId: "wg-writer",
  });
});

test("页面参数 → 视图：只有显式 view=teams 才进按团队", () => {
  assert.equal(resolveCollaborationView("teams"), "teams");
  assert.equal(resolveCollaborationView(undefined), "roles");
  assert.equal(resolveCollaborationView(""), "roles");
  assert.equal(resolveCollaborationView("TEAMS"), "roles");
});

test("进组定位：按团队且命中 id 才给详情；按岗位模式与失效 id 都回列表", () => {
  assert.equal(
    pickActiveGroupDetail({ view: "teams", groupId: "wg-writer", details: GROUPS })?.summary.name,
    "文案一组",
  );
  assert.equal(pickActiveGroupDetail({ view: "teams", groupId: "wg-missing", details: GROUPS }), null);
  assert.equal(
    pickActiveGroupDetail({ view: "roles", groupId: "wg-writer", details: GROUPS }),
    null,
    "按岗位模式下即使 URL 残留 groupId 也不进组",
  );
  assert.equal(pickActiveGroupDetail({ view: "teams", groupId: null, details: GROUPS }), null);
  assert.equal(pickActiveGroupDetail({ view: "teams", groupId: "wg-writer", details: undefined }), null);
});

test("URL 往返：进组链接被页面解析后仍定位到同一个小队（含空格等特殊字符）", () => {
  const group = { summary: { id: "部 一/文案" }, members: [] };
  const url = buildCollaborationUrl({ year: 2026, month: 9, view: "teams", groupId: group.summary.id });
  const params = parsed(url);

  const view = resolveCollaborationView(params.view);
  const detail = pickActiveGroupDetail({ view, groupId: params.groupId, details: [group] });

  assert.equal(view, "teams");
  assert.equal(detail?.summary.id, group.summary.id);
});

test("切回按岗位：不带 view，页面按 roles 解析（不留按团队痕迹）", () => {
  const url = buildCollaborationUrl({ year: 2026, month: 9, view: "roles", tab: "talents" });
  const params = parsed(url);
  assert.equal(params.view, undefined);
  assert.equal(resolveCollaborationView(params.view), "roles");
  assert.equal(params.tab, "talents");
});
