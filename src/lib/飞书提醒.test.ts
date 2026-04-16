import test from "node:test";
import assert from "node:assert/strict";

import { buildReminderContent, getEscalationManager } from "./飞书提醒";

test("连续3天未交会升级提醒到固定管理员", () => {
  const result = buildReminderContent({
    unsubmitted: [
      { user_id: "u1", name: "小王" },
      { user_id: "u2", name: "小李" },
    ],
    streakMap: new Map([
      ["u1", 3],
      ["u2", 2],
    ]),
    submittedCount: 8,
    totalCount: 10,
  });

  assert.equal(result.escalationManager?.name, "十八老师");
  assert.equal(result.escalatedMembers.map((member) => member.name).join(","), "小王");
  assert.match(result.content, /<at id=ou_fe159ab421cebed7b311c3a15cb339c2><\/at>/);
  assert.match(result.content, /\*\*升级提醒：\*\*/);
});

test("未达到3天时不追加升级提醒区块", () => {
  const result = buildReminderContent({
    unsubmitted: [{ user_id: "u1", name: "小王" }],
    streakMap: new Map([["u1", 2]]),
    submittedCount: 9,
    totalCount: 10,
  });

  assert.equal(result.escalatedMembers.length, 0);
  assert.doesNotMatch(result.content, /\*\*升级提醒：\*\*/);
});

test("负责人按手机号固定到十八老师", () => {
  const manager = getEscalationManager();

  assert.equal(manager?.phone, "18867289333");
  assert.equal(manager?.name, "十八老师");
});
