import assert from "node:assert/strict";
import test from "node:test";

import { changeAiFeatureLifecycle } from "./feature-lifecycle";

test("归档功能通过单个数据库事务执行，避免快照与状态写入半完成", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ error: null });
    },
  };

  await changeAiFeatureLifecycle(client, {
    featureKey: "ocr_screenshot",
    label: "截图识别",
    action: "archive",
  });

  assert.deepEqual(calls, [{
    name: "manage_ai_feature_lifecycle",
    args: {
      p_feature_key: "ocr_screenshot",
      p_label: "截图识别",
      p_action: "archive",
    },
  }]);
});

test("恢复功能同样走事务，并让数据库按最新快照还原此前启用状态", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ error: null });
    },
  };

  await changeAiFeatureLifecycle(client, {
    featureKey: "ocr_screenshot_structure",
    label: "截图识别·文字结构化",
    action: "restore",
  });

  assert.deepEqual(calls[0], {
    name: "manage_ai_feature_lifecycle",
    args: {
      p_feature_key: "ocr_screenshot_structure",
      p_label: "截图识别·文字结构化",
      p_action: "restore",
    },
  });
});

test("数据库事务错误会原样反馈给管理接口", async () => {
  const client = {
    rpc() {
      return Promise.resolve({ error: { message: "事务回滚" } });
    },
  };

  await assert.rejects(
    changeAiFeatureLifecycle(client, {
      featureKey: "ocr_screenshot",
      label: "截图识别",
      action: "archive",
    }),
    /事务回滚/,
  );
});
