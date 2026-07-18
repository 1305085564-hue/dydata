import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("员工案例加载失败时提供重新加载入口", () => {
  const source = readFileSync(new URL("./violations-staff-data-container.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(error\)[\s\S]*<ErrorState[\s\S]*description=\{error\}/);
});
