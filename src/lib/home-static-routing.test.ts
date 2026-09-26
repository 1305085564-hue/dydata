import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";

test("【结构契约】公开首页不读取 cookie，保持可静态生成", () => {
  // 构建期契约：首页必须能被静态生成，读 cookie / 动态重定向会让它退化为动态路由。
  // 运行时的等价物（Next 是否真的静态生成该页）本仓库的 node:test 观测不到，故保留源码断言。
  const source = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

  assert.doesNotMatch(source, /next\/headers/);
  assert.doesNotMatch(source, /cookies\(\)/);
  assert.doesNotMatch(source, /redirect\(/);
  assert.match(source, /export default function HomePage/);
});

test("已登录用户在中间件跳转到 Dashboard，未登录放行", async () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testref.supabase.co";
  try {
    const authed = await middleware(new NextRequest("https://dydata.cc/", {
      headers: { cookie: "sb-testref-auth-token=test-token" },
    }));
    assert.equal(authed.status, 307);
    assert.equal(authed.headers.get("location"), "https://dydata.cc/dashboard");

    const anonymous = await middleware(new NextRequest("https://dydata.cc/"));
    assert.equal(anonymous.status, 200, "未登录访问首页必须放行，交给静态首页渲染");
    assert.equal(anonymous.headers.get("location"), null);
  } finally {
    if (originalSupabaseUrl === undefined) Reflect.deleteProperty(process.env, "NEXT_PUBLIC_SUPABASE_URL");
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }
});
