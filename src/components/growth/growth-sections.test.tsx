import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { GrowthClientShell } from "../../app/(app)/growth/growth-client";
import { DiagnosisCard } from "./diagnosis-card";
import { GrowthActionPlanPanelBody } from "./growth-action-plan-panel";
import { ScriptBreakdown } from "./script-breakdown";

test("ScriptBreakdown 空态显示原因和示例拆解", () => {
  const html = renderToStaticMarkup(
    <ScriptBreakdown
      title="文案拆解"
      data={{
        state: "empty",
        rawText: "",
        placeholder: "暂无文案数据",
        segments: [],
      }}
    />,
  );

  assert.match(html, /为什么这里没有真实内容/);
  assert.match(html, /示例拆解参考/);
  assert.match(html, /示例内容/);
  assert.match(html, /开头钩子/);
  assert.match(html, /结尾 CTA/);
});

test("GrowthActionPlanPanelBody 统一成一套行动方案", () => {
  const html = renderToStaticMarkup(
    <GrowthActionPlanPanelBody
      insightState={{ status: "ok", cached: false, insight: { diagnosis: "开头留人偏弱", scene: "2秒跳出率 38%", cause: "第一句太慢", rewrite: "先说结论再给方法" } }}
      advice={{
        source: "ai",
        diagnosis: "这条视频最大问题在开头",
        reference: "参考同题材高表现账号的开头结构",
        action: "下一批先只改钩子",
      }}
      noData={false}
    />,
  );

  assert.match(html, /一句话结论/);
  assert.match(html, /问题证据/);
  assert.match(html, /参考示例/);
  assert.match(html, /改写建议/);
  assert.match(html, /下一步动作/);
  assert.doesNotMatch(html, /昨日复盘洞察/);
  assert.doesNotMatch(html, /诊断 \/ 参考 \/ 动作/);
});

test("DiagnosisCard 渲染分块结构而不是长段列表", () => {
  const html = renderToStaticMarkup(
    <DiagnosisCard
      myReports={[]}
      teamReports={[]}
    />,
  );

  assert.match(html, /问题名：/);
  assert.match(html, /数据证据/);
  assert.match(html, /该学谁 \/ 为什么：/);
  assert.match(html, /下一步动作/);
  assert.match(html, /示例内容/);
});

test("DiagnosisCard 有 submitter 样本时显示真实对标人名字", () => {
  const html = renderToStaticMarkup(
    <DiagnosisCard
      myReports={Array.from({ length: 6 }, (_, index) => ({
        user_id: "self-user",
        account_id: "self-account",
        report_date: `2026-04-${String(index + 1).padStart(2, "0")}`,
        play_count: 1000,
        likes: 10,
        comments: 5,
        shares: 2,
        favorites: 2,
        follower_gain: 5,
        completion_rate: "25",
        completion_rate_5s: "30",
        content: "self",
        submitter: "我",
      }))}
      teamReports={[
        ...Array.from({ length: 6 }, (_, index) => ({
          user_id: "self-user",
          account_id: "self-account",
          report_date: `2026-04-${String(index + 1).padStart(2, "0")}`,
          play_count: 1000,
          likes: 10,
          comments: 5,
          shares: 2,
          favorites: 2,
          follower_gain: 5,
          completion_rate: "25",
          completion_rate_5s: "30",
          content: "self",
          submitter: "我",
        })),
        ...Array.from({ length: 6 }, (_, index) => ({
          user_id: "peer-user",
          account_id: "peer-account",
          report_date: `2026-04-${String(index + 1).padStart(2, "0")}`,
          play_count: 5000,
          likes: 500,
          comments: 80,
          shares: 40,
          favorites: 30,
          follower_gain: 30,
          completion_rate: "55",
          completion_rate_5s: "70",
          content: "peer",
          submitter: "小王",
        })),
      ]}
    />,
  );

  assert.match(html, /参考 小王/);
});

test("GrowthClientShell 使用统一行动面板替代旧双卡", () => {
  const html = renderToStaticMarkup(
    <GrowthClientShell
      profileName="测试用户"
      accountCount={1}
      reportCount={3}
      statusCards={[]}
      capabilityCards={[]}
      weakBenchmarkCards={[]}
      pkPanel={null}
      scriptBreakdown={{
        state: "empty",
        rawText: "",
        placeholder: "暂无文案数据",
        segments: [],
      }}
      advice={{
        source: "rule",
        diagnosis: "测试诊断",
        reference: "测试参考",
        action: "测试动作",
      }}
      myReports={[]}
      teamReports={[]}
      teamMembers={[]}
      summary={{
        hasEnoughData: true,
        weakestDimension: null,
      }}
    />,
  );

  assert.match(html, /AI 洞察与行动建议/);
  assert.match(html, /下一轮先怎么改/);
  assert.doesNotMatch(html, /昨日复盘洞察/);
  assert.doesNotMatch(html, /诊断 \/ 参考 \/ 动作/);
});
