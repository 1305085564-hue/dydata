import test from "node:test";
import assert from "node:assert/strict";

import type { AdminAiToolName } from "./core";
import { shouldRequireConfirmation } from "./core";
import {
  buildCancelledPresentation,
  buildConfirmationRequiredPresentation,
  buildSuccessPresentation,
} from "./presentation";

test("查询类结果会输出人话摘要和结构化明细，不暴露内部字段", () => {
  const presentation = buildSuccessPresentation({
    toolName: "getAnomalousData",
    params: {
      type: "no_submission",
      recentDays: 3,
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
  assert.match(presentation.historyTitle, /未填报/);
  assert.match(presentation.historyTitle, /3/);
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
  assert.ok(
    presentation.details?.sections.some((section) => section.title === "为什么要确认"),
  );
  assert.ok(
    presentation.details?.sections.some((section) => section.title === "影响范围"),
  );
});

type HighRiskCase = {
  toolName: AdminAiToolName;
  params: Record<string, unknown>;
  result: Parameters<typeof buildConfirmationRequiredPresentation>[0]["result"];
  riskKeyword: RegExp;
};

const HIGH_RISK_CASES: HighRiskCase[] = [
  {
    toolName: "kickUser",
    params: { userId: "u1", reason: "离职" },
    result: {
      success: true,
      affectedData: {
        user: { id: "u1", name: "张三", role: "member" },
        metricsCount: 10,
        exemptionsCount: 2,
      },
    },
    riskKeyword: /登录权限/,
  },
  {
    toolName: "changeUserRole",
    params: { userId: "u1", newRole: "admin" },
    result: {
      success: true,
      beforeSnapshot: { id: "u1", role: "member", permissions: {} },
    },
    riskKeyword: /自定义权限/,
  },
  {
    toolName: "updateUserPermissions",
    params: { userId: "u1", permissions: { manage_members: true, view_all_data: true } },
    result: {
      success: true,
      beforeSnapshot: { id: "u1", permissions: {} },
    },
    riskKeyword: /只改权限不改角色/,
  },
  {
    toolName: "deleteMetrics",
    params: { metricsId: "m1", reason: "错误播放" },
    result: {
      success: true,
      beforeSnapshot: {
        id: "m1",
        user_id: "u1",
        report_date: "2026-04-01",
        title: "测试视频",
        play_count: 12345,
      },
    },
    riskKeyword: /无法直接恢复/,
  },
  {
    toolName: "grantExemption",
    params: { userIds: ["u1", "u2"], date: "2026-04-01" },
    result: {
      success: true,
      affectedData: { userCount: 2, date: "2026-04-01", reason: "团队外出" },
    },
    riskKeyword: /不再计入未填报/,
  },
  {
    toolName: "retryDailyReview",
    params: { videoIds: ["v1", "v2"] },
    result: {
      success: true,
      affectedData: { targetCount: 2, videoIds: ["v1", "v2"] },
    },
    riskKeyword: /覆盖原有/,
  },
  {
    toolName: "clearCache",
    params: { cacheType: "all" },
    result: {
      success: true,
      affectedData: { cacheType: "all", note: "将删除分析结果表数据，不是内存缓存" },
    },
    riskKeyword: /全站|建议先清/,
  },
];

for (const testCase of HIGH_RISK_CASES) {
  test(`${testCase.toolName} 的确认文案 = 个性化风险说明 + 影响范围`, () => {
    const presentation = buildConfirmationRequiredPresentation({
      toolName: testCase.toolName,
      params: testCase.params,
      result: testCase.result,
    });

    // answer 不再是通用"这是高风险操作"
    assert.doesNotMatch(presentation.answer, /这是高风险操作/);
    assert.ok(presentation.answer.length > 0);

    // details.sections >= 2
    assert.ok(presentation.details);
    assert.ok(
      (presentation.details?.sections.length ?? 0) >= 2,
      `expected >= 2 sections, got ${presentation.details?.sections.length}`,
    );

    // 风险说明里含对应关键词
    const riskSection = presentation.details?.sections.find(
      (section) => section.title === "为什么要确认",
    );
    assert.ok(riskSection, `risk section missing for ${testCase.toolName}`);
    const riskText = JSON.stringify(riskSection);
    assert.match(riskText, testCase.riskKeyword);

    // nextSteps 提示确认/取消
    assert.ok(presentation.details?.nextSteps);
    assert.match(presentation.details?.nextSteps?.join(" ") ?? "", /确认后|取消/);

    // historyTitle 不超过 24 字
    assert.ok(
      Array.from(presentation.historyTitle).length <= 24,
      `historyTitle too long: ${presentation.historyTitle}`,
    );
  });
}

test("历史标题：未填报查询带最近 N 天和人数", () => {
  const presentation = buildSuccessPresentation({
    toolName: "getAnomalousData",
    params: { type: "no_submission", recentDays: 7 },
    result: {
      success: true,
      data: {
        anomalies: Array.from({ length: 4 }, (_, i) => ({
          date: `2026-04-0${i + 1}`,
          userName: `用户${i + 1}`,
        })),
      },
    },
  });
  assert.match(presentation.historyTitle, /7 天未填报/);
  assert.match(presentation.historyTitle, /4 人/);
});

test("历史标题：用户信息查询带用户名", () => {
  const presentation = buildSuccessPresentation({
    toolName: "getUserInfo",
    params: {},
    result: {
      success: true,
      data: { user: { name: "王五", role: "member", status: "active" } },
    },
  });
  assert.match(presentation.historyTitle, /王五/);
  assert.match(presentation.historyTitle, /用户信息/);
});

test("历史标题：角色变更显示 from → to", () => {
  const presentation = buildConfirmationRequiredPresentation({
    toolName: "changeUserRole",
    params: { userId: "u1", newRole: "admin" },
    result: {
      success: true,
      beforeSnapshot: { id: "u1", role: "member" },
    },
  });
  assert.match(presentation.historyTitle, /成员/);
  assert.match(presentation.historyTitle, /管理员/);
});

test("历史标题：超过 24 字自动截断加省略号", () => {
  const presentation = buildSuccessPresentation({
    toolName: "getUserInfo",
    params: {},
    result: {
      success: true,
      data: { user: { name: "一个超级超级超级超级超级超级超级长的用户名", role: "member", status: "active" } },
    },
  });
  const len = Array.from(presentation.historyTitle).length;
  assert.ok(len <= 24, `title too long: ${len}`);
  assert.ok(presentation.historyTitle.endsWith("…"));
});

test("低风险成功：fillMissingData 返回补填明细 + 下一步", () => {
  const presentation = buildSuccessPresentation({
    toolName: "fillMissingData",
    params: {
      userId: "u1",
      date: "2026-04-05",
      userName: "李四",
      metrics: { total_views: 1200, total_likes: 30, fans_count: 5 },
    },
    result: { success: true, data: { userId: "u1", date: "2026-04-05" } },
  });

  assert.doesNotMatch(presentation.answer, /^操作执行成功/);
  assert.match(presentation.answer, /补填/);
  assert.ok(presentation.details?.sections.length);
  assert.ok(presentation.details?.nextSteps?.length);
  assert.match(presentation.historyTitle, /补填/);
});

test("低风险成功：retryDailyReview 返回执行信息", () => {
  const presentation = buildSuccessPresentation({
    toolName: "retryDailyReview",
    params: { userId: "u1", date: "2026-04-05", userName: "赵六" },
    result: {
      success: true,
      data: { clearedForRetry: ["v1", "v2", "v3"], date: "2026-04-05", userName: "赵六" },
    },
  });

  assert.match(presentation.answer, /次日复盘任务已重新触发/);
  assert.ok(presentation.details?.sections.length);
});

test("取消态 historyTitle 用中文工具名", () => {
  const presentation = buildCancelledPresentation("kickUser");
  assert.match(presentation.historyTitle, /踢出用户/);
  assert.match(presentation.historyTitle, /已取消/);
});
