import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("身份与权限行为：共享请求缓存、失效会话降级及导航并行读取", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("../app/(app)/_components/current-user-context.test.fixture.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

// 纯结构守卫：布局是否声明 Suspense 属于 React 组件组合，独立于身份函数的返回行为。
// 保留这两条，避免用单元测试的假 React 渲染器声称已验证真实流式加载。
test("全局布局不等待权限，并用 Suspense 隔离导航数据", () => {
  const layout = readFileSync(new URL("../app/(app)/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /await getUserPermissions\(\)/);
  assert.match(layout, /<Suspense/);
});
