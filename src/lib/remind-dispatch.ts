/**
 * 催交发送编排（service 层，供 /api/remind 调用）
 *
 * 职责：拿到 claim 后发飞书、按 claim id 流转状态、把所有落库失败
 * 显式带回来。禁止在本层吞掉任何写入失败或伪装成功。
 */

import {
  transitionRemindClaims,
  type ActiveClaim,
  type RemindClaimMember,
  type RemindClaimOutcome,
} from "./remind-claim";

export type FeishuSendOutcome =
  | { ok: true }
  | { ok: false; reason: string; status?: number; bodyPreview?: string };

export type RemindDispatchInput = {
  client: unknown;
  today: string;
  claim: RemindClaimOutcome;
  recipients: RemindClaimMember[];
  send: () => Promise<FeishuSendOutcome>;
  /** 把失败原因翻译成人类可读文案，用于 remind_logs.response_body */
  describeFailure: (reason: string) => string;
};

export type RemindDispatchResult = {
  delivered: boolean;
  failureReason?: string;
  failureHttpStatus?: number;
  /**
   * 终态记录不完整的成员名：
   * - 发送成功但 success 流转失败（停留 sending，今日不会再重发）；
   * - 发送失败且 failed 流转失败/补写失败（可能重复提醒）。
   */
  unresolvedNames: string[];
};

async function insertLegacyLog(
  client: unknown,
  log: {
    target_date: string;
    user_id: string;
    user_name: string;
    status: "success" | "failed";
    is_exempted: boolean;
    response_body?: string | null;
  },
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any).from("remind_logs").insert(log);
    return !error;
  } catch {
    return false;
  }
}

function buildFailureBody(outcome: Exclude<FeishuSendOutcome, { ok: true }>, describeFailure: (reason: string) => string) {
  return [
    describeFailure(outcome.reason),
    outcome.status ? `HTTP ${outcome.status}` : null,
    outcome.bodyPreview ?? null,
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 500);
}

export async function dispatchReminders(
  input: RemindDispatchInput,
): Promise<RemindDispatchResult> {
  const { client, today, claim, recipients, send, describeFailure } = input;

  if (recipients.length === 0) {
    return { delivered: false, failureReason: "no_recipients", unresolvedNames: [] };
  }

  const sendResult = await send();

  // ── legacy 模式：migration 未执行，无数据库抢占兜底（止血级）──
  if (claim.mode === "legacy") {
    const unresolvedNames: string[] = [];
    for (const member of recipients) {
      const inserted = await insertLegacyLog(client, {
        target_date: today,
        user_id: member.user_id,
        user_name: member.name,
        status: sendResult.ok ? "success" : "failed",
        is_exempted: false,
        ...(sendResult.ok ? {} : { response_body: buildFailureBody(sendResult, describeFailure) }),
      });
      if (!inserted) unresolvedNames.push(member.name);
    }
    return sendResult.ok
      ? { delivered: true, unresolvedNames }
      : { delivered: false, failureReason: sendResult.reason, failureHttpStatus: sendResult.status, unresolvedNames };
  }

  const claimIds = (claim.claims as ActiveClaim[])
    .filter((c) => recipients.some((r) => r.user_id === c.member.user_id))
    .map((c) => c.id);

  if (sendResult.ok) {
    // 成功流转是幂等去重依据；失败必须显式暴露，不能伪装完全成功
    const transition = await transitionRemindClaims(client, {
      claimIds,
      toStatus: "success",
    });
    const failedIds = new Set(claimIds.filter((id) => !transition.transitionedIds.includes(id)));
    const unresolvedNames = claim.claims
      .filter((c) => failedIds.has(c.id))
      .map((c) => c.member.name);
    return { delivered: true, unresolvedNames };
  }

  // 发送失败：先把本请求的 claim 流转为 failed（允许后续重试），流转失败再逐条补写 failed 记录
  const response_body = buildFailureBody(sendResult, describeFailure);
  const transition = await transitionRemindClaims(client, {
    claimIds,
    toStatus: "failed",
    responseBody: response_body,
  });

  const unresolvedNames: string[] = [];
  const untransitioned = claim.claims.filter(
    (c) => !transition.transitionedIds.includes(c.id),
  );
  for (const c of untransitioned) {
    const inserted = await insertLegacyLog(client, {
      target_date: today,
      user_id: c.member.user_id,
      user_name: c.member.name,
      status: "failed",
      is_exempted: false,
      response_body,
    });
    if (!inserted) unresolvedNames.push(c.member.name);
  }

  return {
    delivered: false,
    failureReason: sendResult.reason,
    failureHttpStatus: sendResult.status,
    unresolvedNames,
  };
}
