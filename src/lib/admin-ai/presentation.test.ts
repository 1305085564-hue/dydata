import test from "node:test";
import assert from "node:assert/strict";

import { shouldRequireConfirmation } from "./core";
import {
  buildConfirmationRequiredPresentation,
  buildSuccessPresentation,
} from "./presentation";

test("查询类结果会输出人话摘要和结构化明细，不暴露内部字段", () => {
  const presentation = buildSuccessPresentation({
    toolName: "getAnomalousData",
    params: {
      type: "no_submission",
    },
    result: {
      success: true,
      data: {
        anomalies: [
          {
            date: "2026-04-08",
            userId: "internal-user-id",
            userName: "张三",
            issue: "未提交日报",
            severity: "medium",
          },
        ],
      },
    },
  });

  assert.match(presentation.answer, /1 条/);
  assert.equal(presentation.historyTitle, "未填报查询结果");
  assert.ok(presentation.details);
  assert.equal(presentation.details?.sections[0]?.kind, "fields");
  assert.equal(presentation.details?.sections[2]?.kind, "table");

  const serialized = JSON.stringify(presentation.details);
  assert.doesNotMatch(serialized, /internal-user-id/);
  assert.doesNotMatch(serialized, /severity/);
});

test("高风险修改会保留确认链路并输出影响范围", () => {
  assert.equal(
    shouldRequireConfirmation("changeUserRole", { batch: false }),
    true,
  );

  const presentation = buildConfirmationRequiredPresentation({
    toolName: "changeUserRole",
    params: {
      userId: "user-1",
      newRole: "admin",
    },
    result: {
      success: true,
      beforeSnapshot: {
        id: "user-1",
        role: "member",
      },
    },
  });

  assert.match(presentation.answer, /角色改成管理员/);
  assert.equal(presentation.historyTitle, "角色变更确认");
  assert.ok(presentation.details?.sections.some((section) => section.title === "影响范围"));
});
