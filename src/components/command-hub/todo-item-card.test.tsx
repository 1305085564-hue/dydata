import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ActionItem } from "@/lib/action-center/types";
import { TodoItemCard } from "./todo-item-card";

const baseTodo: ActionItem = {
  id: "todo-absent",
  source: "fulfillment",
  priority: "P1",
  title: "你 11-17 被标记为缺勤",
  description: "如有异议请联系管理员",
  actionLabel: "打开工作台",
  actionUrl: "/dashboard",
  action: null,
  status: "open",
  createdAt: "2026-11-17T12:00:00Z",
  dedupeKey: "fulfillment_absent:u:2026-11-17",
  exemption_category: null,
};

test("带跳转链接的普通待办仍显示完成按钮，否则没有任何途径关闭它", () => {
  const html = renderToStaticMarkup(<TodoItemCard todo={baseTodo} isProcessing={false} />);
  assert.match(html, /完成待办：你 11-17 被标记为缺勤/);
  assert.match(html, /打开工作台/);
});

test("补交审批提醒只能进入审批，不显示完成按钮", () => {
  const appealTodo: ActionItem = {
    ...baseTodo,
    id: "todo-appeal",
    title: "补交审批",
    actionUrl: "/admin/fulfillment",
    action: {
      type: "review-fulfillment-appeal",
      endpoint: "/api/admin/fulfillment/appeal/handle",
      method: "POST",
      appealId: "appeal-1",
    },
  };
  const html = renderToStaticMarkup(<TodoItemCard todo={appealTodo} isProcessing={false} />);
  assert.doesNotMatch(html, /完成待办：/);
});
