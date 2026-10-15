import { deriveResumePending, type AppealRow } from "@/app/api/exemptions/_fulfillment-appeals";

export type AppealResponseRow = Pick<
  AppealRow,
  "id" | "user_id" | "record_date" | "reason" | "status" | "handler_id" | "handled_at" | "created_at" | "submission_payload"
>;

export type AppealNameMap = Map<string, { name: string | null }>;

// 返回给前端的申诉行：只透出执行状态布尔值，不透出 submission_payload 原文。
export function mapAppealRowForResponse(row: AppealResponseRow, profileMap: AppealNameMap) {
  const { submission_payload: submissionPayload, ...appeal } = row;
  return {
    ...appeal,
    resumePending: deriveResumePending(row.status, submissionPayload),
    user_name: profileMap.get(row.user_id)?.name ?? null,
    handler_name: row.handler_id ? profileMap.get(row.handler_id)?.name ?? null : null,
  };
}
