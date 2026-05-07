import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCheckpointStatus,
  buildSopMatrixRows,
  buildReviewDecision,
  canAccessSopManagementView,
  canTransitionCheckpointStatus,
  canReadGroupSop,
  canReadSopStatus,
  canReviewCheckpoint,
  canSubmitOwnCheckpoint,
  getNextBlocker,
} from "./core";

import type { SopCheckpoint, SopCheckpointStatus } from "@/types";

const allIdle: Record<SopCheckpoint, SopCheckpointStatus> = {
  DATA_REPORT: "IDLE",
  MORNING_REVIEW: "IDLE",
  TOPIC: "IDLE",
  SCRIPT: "IDLE",
  VIDEO: "IDLE",
};

test("SOP 状态流转会更新当前阻塞卡点", () => {
  assert.equal(getNextBlocker(allIdle), "DATA_REPORT");

  const afterDataReport = applyCheckpointStatus(allIdle, "DATA_REPORT", "APPROVED");
  assert.equal(afterDataReport.currentBlocker, "MORNING_REVIEW");
  assert.equal(afterDataReport.isOverdue, false);

  const afterTopicRejected = applyCheckpointStatus(
    { ...afterDataReport.statuses, MORNING_REVIEW: "APPROVED" },
    "TOPIC",
    "REJECTED",
  );
  assert.equal(afterTopicRejected.currentBlocker, "TOPIC");
});

test("低于 6 分自动打回，达到 6 分自动通过", () => {
  const rejected = buildReviewDecision({
    HOOK: 5,
    VIEWPOINT: 6,
    COMPLIANCE: 5,
    PERFORMANCE_HOOK: 6,
    YESTERDAY_REVIEW: 5,
    CTA: 6,
  });

  assert.equal(rejected.totalScore, 5.5);
  assert.equal(rejected.isPassed, false);
  assert.equal(rejected.nextStatus, "REJECTED");

  const approved = buildReviewDecision({
    HOOK: 6,
    VIEWPOINT: 6,
    COMPLIANCE: 6,
    PERFORMANCE_HOOK: 6,
    YESTERDAY_REVIEW: 6,
    CTA: 6,
  });

  assert.equal(approved.totalScore, 6);
  assert.equal(approved.isPassed, true);
  assert.equal(approved.nextStatus, "APPROVED");
});

test("状态流转只能按 SOP 顺序推进", () => {
  assert.equal(canTransitionCheckpointStatus("IDLE", "PENDING"), true);
  assert.equal(canTransitionCheckpointStatus("PENDING", "SUBMITTED"), true);
  assert.equal(canTransitionCheckpointStatus("SUBMITTED", "APPROVED"), true);
  assert.equal(canTransitionCheckpointStatus("SUBMITTED", "REJECTED"), true);
  assert.equal(canTransitionCheckpointStatus("REJECTED", "PENDING"), true);
  assert.equal(canTransitionCheckpointStatus("OVERDUE", "SUBMITTED"), true);

  assert.equal(canTransitionCheckpointStatus("IDLE", "APPROVED"), false);
  assert.equal(canTransitionCheckpointStatus("PENDING", "APPROVED"), false);
  assert.equal(canTransitionCheckpointStatus("APPROVED", "REJECTED"), false);
});

test("权限判断区分达人本人、组长小组、owner/admin 全局", () => {
  const member = {
    userId: "user-a",
    role: "member" as const,
    teamId: "team-1",
    groupId: "group-1",
    ledGroupIds: [],
  };
  const leader = {
    userId: "leader-a",
    role: "admin" as const,
    teamId: "team-1",
    groupId: "group-1",
    ledGroupIds: ["group-1"],
  };
  const memberListedAsLeader = {
    userId: "leader-b",
    role: "member" as const,
    teamId: "team-1",
    groupId: "group-1",
    ledGroupIds: ["group-1"],
  };
  const sameGroupMember = {
    userId: "user-c",
    role: "member" as const,
    teamId: "team-1",
    groupId: "group-1",
    ledGroupIds: [],
  };
  const owner = {
    userId: "owner-a",
    role: "owner" as const,
    teamId: null,
    groupId: null,
    ledGroupIds: [],
  };
  const target = { userId: "user-a", teamId: "team-1", groupId: "group-1" };
  const otherTarget = { userId: "user-b", teamId: "team-1", groupId: "group-2" };

  assert.deepEqual(canSubmitOwnCheckpoint(member, "user-a"), { allowed: true, scope: "self" });
  assert.equal(canSubmitOwnCheckpoint(member, "user-b").allowed, false);

  assert.deepEqual(canReadSopStatus(member, target), { allowed: true, scope: "self" });
  assert.deepEqual(canReadSopStatus(leader, target), { allowed: true, scope: "group" });
  assert.equal(canReadSopStatus(sameGroupMember, target).allowed, false);
  assert.equal(canReadSopStatus(memberListedAsLeader, target).allowed, false);
  assert.deepEqual(canReadSopStatus(owner, otherTarget), { allowed: true, scope: "global" });

  assert.deepEqual(canReviewCheckpoint(leader, target), { allowed: true, scope: "group" });
  assert.equal(canReviewCheckpoint(leader, otherTarget).allowed, false);
  assert.equal(canReviewCheckpoint(sameGroupMember, target).allowed, false);
  assert.equal(canReviewCheckpoint(memberListedAsLeader, target).allowed, false);
  assert.deepEqual(canReadGroupSop(leader, "group-1"), { allowed: true, scope: "group" });
  assert.equal(canReadGroupSop(sameGroupMember, "group-1").allowed, false);
  assert.equal(canReadGroupSop(memberListedAsLeader, "group-1").allowed, false);
  assert.equal(canReadGroupSop(leader, "group-2").allowed, false);
});

test("SOP 管理视图只允许 admin/owner 访问", () => {
  const member = {
    userId: "user-a",
    role: "member" as const,
    teamId: "team-1",
    groupId: "group-1",
    ledGroupIds: [],
  };
  const leaderByGroup = {
    userId: "leader-a",
    role: "member" as const,
    teamId: "team-1",
    groupId: "group-1",
    ledGroupIds: ["group-1"],
  };
  const admin = {
    userId: "admin-a",
    role: "admin" as const,
    teamId: "team-1",
    groupId: "group-1",
    ledGroupIds: [],
  };
  const owner = {
    userId: "owner-a",
    role: "owner" as const,
    teamId: null,
    groupId: null,
    ledGroupIds: [],
  };

  assert.deepEqual(canAccessSopManagementView(member), { allowed: false, scope: "denied" });
  assert.deepEqual(canAccessSopManagementView(leaderByGroup), { allowed: false, scope: "denied" });
  assert.deepEqual(canAccessSopManagementView(admin), { allowed: true, scope: "group" });
  assert.deepEqual(canAccessSopManagementView(owner), { allowed: true, scope: "global" });
});

test("矩阵聚合按成员生成 5 卡点状态，并限制默认 24 人", () => {
  const profiles = Array.from({ length: 25 }, (_, index) => ({
    userId: `user-${index + 1}`,
    userName: `成员${index + 1}`,
    teamId: "team-1",
    groupId: index < 10 ? "group-1" : "group-2",
  }));

  const rows = buildSopMatrixRows({
    profiles,
    statusDate: "2026-05-05",
    statuses: [
      {
        userId: "user-1",
        statusDate: "2026-05-05",
        statuses: {
          DATA_REPORT: "APPROVED",
          MORNING_REVIEW: "APPROVED",
          TOPIC: "SUBMITTED",
          SCRIPT: "IDLE",
          VIDEO: "IDLE",
        },
        currentBlocker: "TOPIC",
        isOverdue: false,
      },
    ],
    submissions: [
      { userId: "user-1", checkpoint: "TOPIC", reviewStatus: "SUBMITTED" },
      { userId: "user-1", checkpoint: "SCRIPT", reviewStatus: "APPROVED" },
    ],
  });

  assert.equal(rows.length, 24);
  assert.equal(rows[0].statuses.TOPIC, "SUBMITTED");
  assert.equal(rows[0].submittedCount, 2);
  assert.equal(rows[0].approvedCount, 1);
  assert.equal(rows[1].currentBlocker, "DATA_REPORT");
});
