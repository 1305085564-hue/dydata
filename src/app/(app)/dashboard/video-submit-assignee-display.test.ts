import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAssigneeDisplay,
  type HistoricalAssigneeProfile,
} from "./video-submit-form-state";

const USER_ID = "user-self";
const ACTIVE_PEER_ID = "member-active";
const ARCHIVED_MEMBER_ID = "member-archived";
const GONE_MEMBER_ID = "member-gone";

const activeMembers = [
  { id: ACTIVE_PEER_ID, name: "张三", display_name: "三哥" },
  { id: USER_ID, name: "阿禅", display_name: "阿禅" },
];

const historicalProfiles: HistoricalAssigneeProfile[] = [
  { userId: ARCHIVED_MEMBER_ID, name: "李四", displayName: "四爷", membershipStatus: "archived" },
];

test("本人显示为（我），不算外协", () => {
  assert.deepEqual(resolveAssigneeDisplay({
    assignedUserId: USER_ID,
    currentUserId: USER_ID,
    activeMembers,
  }), { text: "阿禅 (我)", external: false, historical: false });

  // 未指派默认按本人处理
  assert.deepEqual(resolveAssigneeDisplay({
    assignedUserId: null,
    currentUserId: USER_ID,
    activeMembers,
  }), { text: "阿禅 (我)", external: false, historical: false });
});

test("在职候选成员正常显示，可改选", () => {
  const display = resolveAssigneeDisplay({
    assignedUserId: ACTIVE_PEER_ID,
    currentUserId: USER_ID,
    activeMembers,
  });
  assert.equal(display.text, "三哥");
  assert.equal(display.external, true);
  assert.equal(display.historical, false);
});

test("已归档/离队责任人显示旧姓名并标注历史成员，不冒充当前用户", () => {
  const display = resolveAssigneeDisplay({
    assignedUserId: ARCHIVED_MEMBER_ID,
    currentUserId: USER_ID,
    activeMembers,
    historicalProfiles,
  });
  assert.equal(display.text, "四爷（历史成员 · 不可选）");
  assert.equal(display.historical, true);
  assert.notEqual(display.text, "阿禅 (我)");
});

test("找不到旧档案时显示“历史责任人”，绝不显示成本人", () => {
  const display = resolveAssigneeDisplay({
    assignedUserId: GONE_MEMBER_ID,
    currentUserId: USER_ID,
    activeMembers,
    historicalProfiles,
  });
  assert.equal(display.text, "历史责任人（不可选）");
  assert.equal(display.historical, true);

  // 档案存在但姓名为空同样回退到“历史责任人”
  const nameless = resolveAssigneeDisplay({
    assignedUserId: "member-nameless",
    currentUserId: USER_ID,
    activeMembers,
    historicalProfiles: [{ userId: "member-nameless", name: null, displayName: null }],
  });
  assert.equal(nameless.text, "历史责任人（不可选）");
});
