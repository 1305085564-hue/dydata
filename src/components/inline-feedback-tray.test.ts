import assert from "node:assert/strict";
import test from "node:test";
import { InlineFeedbackTray, type InlineFeedbackTrayProps } from "./inline-feedback-tray";

test("InlineFeedbackTray 导出完整属性契约", () => {
  assert.equal(typeof InlineFeedbackTray, "function");

  // 类型验证：确保接口字段契约稳定
  const mockProps: InlineFeedbackTrayProps = {
    initialAction: "rejected",
    title: "测试驳回",
    scopeHint: "驳回将通知成员",
    required: true,
    confirmLabel: "确认驳回",
    isSubmitting: false,
    onConfirm: () => {},
    onCancel: () => {},
  };
  assert.equal(mockProps.required, true);
  assert.equal(mockProps.confirmLabel, "确认驳回");
});
