export const CONTENT_FEEDBACK_DELIVERY_ENABLED = false;

export type ContentFeedbackAction =
  | "confirm"
  | "send"
  | "create_and_confirm"
  | "confirm_and_send"
  | "create_confirm_send"
  | "save_draft";

export function isContentFeedbackDeliveryAction(action: ContentFeedbackAction) {
  return action === "send" || action === "confirm_and_send" || action === "create_confirm_send";
}

export function buildDeliveryDisabledPayload() {
  return {
    ok: false,
    delivery_disabled: true,
    error: "站内下发流程已暂停，请先保存草稿并复制建议到飞书。",
  };
}
