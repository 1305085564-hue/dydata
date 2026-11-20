import assert from "node:assert/strict";
import test from "node:test";

import { mergeLocalWorkGroupViews, stepCollaborationMonth } from "./workbench-state";

const now = { year: 2026, month: 11 };

test("翻月：跨年进退位，早于 2026 年 7 月或晚于本月返回 null", () => {
  assert.deepEqual(stepCollaborationMonth(2026, 8, -1, now), { year: 2026, month: 7 });
  assert.equal(stepCollaborationMonth(2026, 7, -1, now), null);
  assert.equal(stepCollaborationMonth(2026, 11, 1, now), null);
  assert.deepEqual(stepCollaborationMonth(2026, 12, 1, { year: 2027, month: 3 }), { year: 2027, month: 1 });
  assert.deepEqual(stepCollaborationMonth(2027, 1, -1, { year: 2027, month: 3 }), { year: 2026, month: 12 });
});

test("小队视图：名字和人数跟本地编制走，本地新建的小队给空绩效并补空名单详情", () => {
  const merged = mergeLocalWorkGroupViews(
    { ready: true, groups: [], details: [] },
    [{ id: "wg-new", name: "新文案组", kind: "writer", teamId: "t-1" } as never],
    [{ userId: "u-1", peerGroupId: "wg-new", operatorGroupId: null } as never],
  );
  assert.equal(merged?.groups[0].memberCount, 1);
  assert.equal(merged?.groups[0].aggregate.reportCount, 0);
  assert.deepEqual(merged?.details.map((d) => [d.summary.id, d.members.length]), [["wg-new", 0]]);
  assert.equal(mergeLocalWorkGroupViews(undefined, [], []), undefined);
});
