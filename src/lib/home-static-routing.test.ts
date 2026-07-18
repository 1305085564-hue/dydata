import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("公开首页不读取 cookie，保持可静态生成", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

  assert.doesNotMatch(source, /next\/headers/);
  assert.doesNotMatch(source, /cookies\(\)/);
  assert.doesNotMatch(source, /redirect\(/);
  assert.match(source, /export default function HomePage/);
});

test("已登录用户在中间件跳转到 Dashboard", () => {
  const source = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");

  assert.match(source, /pathname === "\/" && hasAuthCookie/);
  assert.match(source, /NextResponse\.redirect\(new URL\("\/dashboard", request\.url\)\)/);
});

