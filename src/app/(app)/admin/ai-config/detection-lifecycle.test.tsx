import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const computeSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx"),
  "utf8",
);
const channelSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/channel-pool-view.tsx"),
  "utf8",
);

test("R4 两个批量入口显式使用 120 秒预算并启动有界刷新", () => {
  assert.match(computeSource, /runCommand\("check_all_in_use".*AI_MODEL_BATCH_TIMEOUT_MS\)/);
  assert.match(channelSource, /runCommand\("test_key_all_models".*AI_MODEL_BATCH_TIMEOUT_MS\)/);
  assert.match(computeSource, /startDetectionRefresh/);
  assert.match(channelSource, /startDetectionRefresh/);
  assert.match(computeSource, /loadData/);
  assert.match(channelSource, /loadData/);
});

test("R4 中断后保留“未完整收齐”说明和手动重新读取入口", () => {
  for (const source of [computeSource, channelSource]) {
    assert.match(source, /检测未完整收齐/);
    assert.match(source, /重新读取最新状态/);
  }
});

// 执行组件原本的点击处理函数，验证状态流转；不复制另一份待测逻辑。
function handler(source: string, name: string, scope: Record<string, unknown>) {
  const file = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(expression, `缺少 ${name}`);
  const compiled = ts.transpileModule(`const fn = ${expression.getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(scope), `${compiled}\nreturn fn;`)(...Object.values(scope)) as () => Promise<void>;
}

for (const [label, source, name] of [
  ["检查一遍", computeSource, "handleCheckAll"],
  ["检测此渠道", channelSource, "handleTestKey"],
]) {
  const setup = (response: unknown, reads: boolean[]) => {
    let state = "idle";
    let stopped = false;
    let windowEnd = () => {};
    const ref: { current: { stop: () => void } | null } = { current: null };
    const scope: Record<string, unknown> = {
      setIsCheckingAll: () => {}, setIsTestingChannel: () => {},
      setCheckResult: () => {}, setTestResult: () => {},
      setDetectionState: (value: string) => { state = value; },
      detectionRefreshRef: ref,
      selectedChannel: { id: "channel" }, channelTestSeq: { current: 0 },
      AI_MODEL_BATCH_TIMEOUT_MS: 120_000,
      startDetectionRefresh: (options: { onWindowEnd: () => void }) => {
        windowEnd = options.onWindowEnd;
        return { stop: () => { stopped = true; } };
      },
      runCommand: async () => response,
      loadData: async () => reads.shift() ?? true,
      feedbackToast: { error: () => {}, success: () => {}, warning: () => {} },
    };
    return { scope, state: () => state, stopped: () => stopped, end: () => windowEnd() };
  };

  test(`R4 ${label}：最终读取失败保留重读入口，重读成功才解除未同步状态`, async () => {
    const context = setup({ ok: true, body: { total: 1, allPassed: true, results: [] } }, [false, true]);
    await handler(source, name, context.scope)();
    assert.equal(context.state(), "unsynced");
    assert.equal(context.stopped(), true);
    await handler(source, "handleReloadAfterDetection", { ...context.scope, detectionState: context.state() })();
    assert.equal(context.state(), "idle");
  });

  test(`R4 ${label}：接口错误仍读回后台状态，到原窗口上限停止`, async () => {
    const context = setup({ ok: false, error: "网关超时" }, []);
    await handler(source, name, context.scope)();
    assert.equal(context.state(), "reading");
    assert.equal(context.stopped(), false);
    context.end();
    assert.equal(context.state(), "stopped");
  });

  test(`R4 ${label}：请求在窗口结束后中断，不再冒称正在自动读取`, async () => {
    const context = setup(null, []);
    let now = 0;
    context.scope.Date = { now: () => now };
    context.scope.runCommand = async () => { now = 120_000; throw new Error("超时"); };
    await handler(source, name, context.scope)();
    assert.equal(context.state(), "stopped");
  });
}
