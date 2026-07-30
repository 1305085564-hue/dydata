import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("员工案例加载失败时提供重新加载入口", () => {
  const source = readFileSync(new URL("./violations-staff-data-container.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(error\)[\s\S]*<ErrorState[\s\S]*description=\{error\}/);
});

test("loadCases 传递全部 guidanceMethods 而非只取第一个", () => {
  const source = readFileSync(new URL("./violations-staff-data-container.tsx", import.meta.url), "utf8");

  // 必须传递完整数组，不能截断为第一个
  assert.match(source, /guidanceMethods:\s*params\.guidanceMethods/);
  // 确认不再有 guidanceMethods[0] 的旧写法
  assert.doesNotMatch(source, /guidanceMethods\[0\]/);
});
