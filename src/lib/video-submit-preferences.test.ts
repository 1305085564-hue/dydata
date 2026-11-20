import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCreateSubmissionPreferences,
  resolveVisibleActiveMemberIds,
} from "./video-submit-preferences";

const remembered = {
  scriptAuthorUserId: "author-last",
  videoEditorUserId: "editor-last",
  operatorUserId: "operator-last",
  topicTag: "干货",
};

test("新填报偏好按草稿优先、最近提交其次、默认值最后", () => {
  const fromLastReport = resolveCreateSubmissionPreferences({
    userId: "self",
    lastReport: remembered,
    visibleMemberIds: new Set(["self", "author-last", "editor-last", "operator-last"]),
  });
  assert.deepEqual(fromLastReport, remembered);

  const fromDraft = resolveCreateSubmissionPreferences({
    userId: "self",
    lastReport: remembered,
    draft: {
      scriptAuthorUserId: "author-draft",
      videoEditorUserId: "editor-draft",
      operatorUserId: "operator-draft",
      topicTag: "复盘",
    },
    visibleMemberIds: new Set([
      "self",
      "author-last", "editor-last", "operator-last",
      "author-draft", "editor-draft", "operator-draft",
    ]),
  });
  assert.deepEqual(fromDraft, {
    scriptAuthorUserId: "author-draft",
    videoEditorUserId: "editor-draft",
    operatorUserId: "operator-draft",
    topicTag: "复盘",
  });

  assert.deepEqual(resolveCreateSubmissionPreferences({ userId: "self" }), {
    scriptAuthorUserId: "self",
    videoEditorUserId: "self",
    operatorUserId: "self",
    topicTag: "复盘",
  });
});

test("最近日报里的责任人不再是可见成员时回退到当前用户", () => {
  assert.deepEqual(resolveCreateSubmissionPreferences({
    userId: "self",
    lastReport: remembered,
    visibleMemberIds: new Set(["self", "author-last"]),
  }), {
    scriptAuthorUserId: "author-last",
    videoEditorUserId: "self",
    operatorUserId: "self",
    topicTag: "干货",
  });
});

test("草稿中的责任人已不可见时回退到当前用户", () => {
  assert.deepEqual(resolveCreateSubmissionPreferences({
    userId: "self",
    lastReport: remembered,
    draft: { scriptAuthorUserId: "author-draft" },
    visibleMemberIds: new Set(["self", "author-last", "editor-last", "operator-last"]),
  }), {
    scriptAuthorUserId: "self",
    videoEditorUserId: "editor-last",
    operatorUserId: "operator-last",
    topicTag: "干货",
  });
});

test("仅当前团队在职成员可作为记忆责任人，其他成员的岗位回退到本人", () => {
  const visibleMemberIds = resolveVisibleActiveMemberIds({
    userId: "self",
    teamId: "team-1",
    members: [
      { id: "active", team_id: "team-1", membership_status: "active" },
      { id: "archived", team_id: "team-1", membership_status: "archived" },
      { id: "blocked", team_id: "team-1", membership_status: "blocked" },
      { id: "other-team", team_id: "team-2", membership_status: "active" },
    ],
  });
  assert.deepEqual(resolveCreateSubmissionPreferences({
    userId: "self",
    visibleMemberIds,
    lastReport: {
      scriptAuthorUserId: "active",
      videoEditorUserId: "archived",
      operatorUserId: "blocked",
      topicTag: "干货",
    },
  }), {
    scriptAuthorUserId: "active",
    videoEditorUserId: "self",
    operatorUserId: "self",
    topicTag: "干货",
  });
  assert.equal(visibleMemberIds.has("other-team"), false);
});
