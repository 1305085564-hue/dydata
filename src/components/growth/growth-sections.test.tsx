import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { GrowthClientShell } from "../../app/(app)/growth/growth-client";
import { AdvicePanel } from "./advice-panel";
import { CapabilityGrid } from "./capability-grid";
import { GrowthPkPanel } from "./growth-pk-panel";
import { ScriptBreakdown } from "./script-breakdown";
import { WeaknessBenchmarkGrid } from "./weakness-benchmark-grid";

test("CapabilityGrid 渲染六维能力卡并显示样本不足提示", () => {
  const html = renderToStaticMarkup(
    <CapabilityGrid
      items={[
        {
          key: "hook",
          name: "开头留人",
          metricLabel: "5秒完播率",
          metricValue: 52.3,
          metricText: "52.3%",
          rating: { label: "弱", tone: "danger" },
          sample: { count: 8, label: "样本 8", signal: "red", hint: "样本不足，结论仅供参考" },
        },
      ]}
    />,
  );

  assert.match(html, /开头留人/);
  assert.match(html, /5秒完播率/);
  assert.match(html, /样本不足/);
  assert.match(html, /弱/);
});

test("ScriptBreakdown 在回退模式下显示原始文案与 AI拆解中", () => {
  const html = renderToStaticMarkup(
    <ScriptBreakdown
      title="文案拆解"
      data={{
        state: "fallback",
        rawText: "先抛结论，再给方法。",
        placeholder: "AI拆解中",
        segments: [],
      }}
    />,
  );

  assert.match(html, /先抛结论/);
  assert.match(html, /AI拆解中/);
});

test("CapabilityGrid 无数据时显示六维占位", () => {
  const html = renderToStaticMarkup(<CapabilityGrid items={[]} />);
  assert.match(html, /数据不足/);
  assert.match(html, /--/);
});

test("WeaknessBenchmarkGrid 无数据时显示对标空态", () => {
  const html = renderToStaticMarkup(<WeaknessBenchmarkGrid items={[]} />);
  assert.match(html, /暂无可用对标数据/);
});

test("GrowthPkPanel 无对比对象时显示引导文案", () => {
  const html = renderToStaticMarkup(<GrowthPkPanel leftName="我" rightName="对手" rows={[]} />);
  assert.match(html, /请先选择对比对象/);
});

test("AdvicePanel 在 AI 失败时显示不可用文案", () => {
  const html = renderToStaticMarkup(
    <AdvicePanel
      data={{
        source: "error",
        diagnosis: "",
        reference: "",
        action: "",
      }}
    />,
  );
  assert.match(html, /AI 分析暂时不可用/);
});

test("GrowthClientShell 无数据时仍渲染模块级空态", () => {
  const html = renderToStaticMarkup(
    <GrowthClientShell
      profileName="测试用户"
      accountCount={1}
      reportCount={0}
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
    />,
  );

  assert.match(html, /六维能力/);
  assert.match(html, /暂无可用对标数据/);
  assert.match(html, /暂无文案数据/);
  assert.match(html, /诊断 \/ 参考 \/ 动作/);
  assert.doesNotMatch(html, /提交 2 天以上数据后即可查看成长分析/);
});
