"use client";

import type { WorkGroupKind } from "./types";

/**
 * 小队编制的「互斥 / 兼任」文案唯一来源。
 * 抽屉、测试与后续任何入口都读这里，避免同一规则在多个对话框里说法不一致。
 */

export const WORK_GROUP_PEER_MUTEX_TEXT = "成员不能同时属于文案组和达人组";
export const WORK_GROUP_OPERATOR_CONCURRENT_TEXT = "运营组支持兼任";

/** 规则说明：文案/达人互斥（换组自动替换）；运营可兼任（换组也自动替换）。 */
export function resolveWorkGroupRuleText(kind: WorkGroupKind): string {
  return kind === "operator"
    ? `${WORK_GROUP_OPERATOR_CONCURRENT_TEXT}：成员可同时属于一个文案/达人组和一个运营组；加入新的运营组会自动替换原运营组（无需先取消）。`
    : `互斥规则：${WORK_GROUP_PEER_MUTEX_TEXT}。若已在其他工种组，分配后将自动替换原归属（无需先取消）。`;
}

export function WorkGroupRuleHint({ kind }: { kind: WorkGroupKind }) {
  return (
    <div className="text-[12px] text-[#78716C] flex items-start gap-1">
      <span className="text-[#D97757] font-semibold">ℹ</span>
      <span>{resolveWorkGroupRuleText(kind)}</span>
    </div>
  );
}

/**
 * 候选成员的归属提示：告诉操作人「这一加入会发生什么」——替换 / 兼任 / 无变化。
 * 只描述结果，不在这里做规则判定（判定在 src/lib/work-groups.ts）。
 */
export function describeCandidateAssignment(input: {
  kind: WorkGroupKind;
  peerGroupName?: string | null;
  operatorGroupName?: string | null;
}): string {
  if (input.kind === "operator") {
    if (input.operatorGroupName) {
      return `（当前在运营组【${input.operatorGroupName}】，加入将替换）`;
    }
    if (input.peerGroupName) {
      return `（兼任，保留【${input.peerGroupName}】）`;
    }
    return "";
  }
  if (input.peerGroupName) {
    return `（当前在【${input.peerGroupName}】，加入将替换原归属）`;
  }
  return "";
}

/**
 * 分配成功后的提示：发生替换时把原组名说出来（「已从 A 移入 B」），
 * 免得操作人以为这个人现在同时挂在两个组里。两个入口共用同一句话。
 */
export function describeAssignSuccess(input: {
  groupName: string;
  replacedGroupName: string | null;
}): string {
  return input.replacedGroupName
    ? `已从「${input.replacedGroupName}」移入「${input.groupName}」`
    : `已分配至「${input.groupName}」`;
}
