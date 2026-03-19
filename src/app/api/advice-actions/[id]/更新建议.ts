import type { AdviceStatus, ReviewResult } from "@/types";

export type AdviceUpdateAction =
  | { action: "assign"; actorUserId: string }
  | { action: "review"; actorUserId: string; reviewResult: ReviewResult }
  | { action: "status"; actorUserId: string; status: AdviceStatus };

export function buildAdviceUpdatePayload(input: AdviceUpdateAction) {
  if (input.action === "assign") {
    return {
      assigned_by: input.actorUserId,
      status: "待执行" as const,
    };
  }

  if (input.action === "review") {
    return {
      review_result: input.reviewResult,
      reviewed_by: input.actorUserId,
      status: "已复核" as const,
    };
  }

  return {
    status: input.status,
  };
}
