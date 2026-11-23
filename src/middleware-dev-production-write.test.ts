import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import cloudbaserc from "../cloudbaserc.json";

import { shouldBlockDevProductionWrite } from "./middleware";

const cloudBaseProductionEnv: Record<string, string | undefined> = {
  NODE_ENV: "development",
  CLOUDBASE_ENV_ID: cloudbaserc.envId,
  NEXT_PUBLIC_CLOUDBASE_ENV_ID: cloudbaserc.envId,
};

test("开发环境连生产库时拦截 POST，GET 放行", () => {
  assert.equal(
    shouldBlockDevProductionWrite(new NextRequest("https://dydata.cc/api/videos", { method: "POST" }), cloudBaseProductionEnv),
    true,
  );
  assert.equal(
    shouldBlockDevProductionWrite(new NextRequest("https://dydata.cc/api/videos", { method: "GET" }), cloudBaseProductionEnv),
    false,
  );
});

test("登录、退出、会话续期入口放行", () => {
  for (const pathname of [
    "/login",
    "/api/cloudbase/auth/signin",
    "/api/cloudbase/auth/signout",
    "/api/cloudbase/auth/refresh",
  ]) {
    assert.equal(
      shouldBlockDevProductionWrite(new NextRequest(`https://dydata.cc${pathname}`, { method: "POST" }), cloudBaseProductionEnv),
      false,
      pathname,
    );
  }
});

test("本机预览截图凭证的 POST/DELETE 放行，其他写请求继续拦截", () => {
  for (const method of ["POST", "DELETE"]) {
    assert.equal(
      shouldBlockDevProductionWrite(
        new NextRequest("https://dydata.cc/api/submission-screenshots/grant", { method }),
        cloudBaseProductionEnv,
      ),
      false,
      method,
    );
  }
  assert.equal(
    shouldBlockDevProductionWrite(
      new NextRequest("https://dydata.cc/api/submission-screenshots/grant/other", { method: "POST" }),
      cloudBaseProductionEnv,
    ),
    true,
  );
});

test("本机预览 AI 配置依赖的 POST 放行，近似路径继续拦截", () => {
  assert.equal(
    shouldBlockDevProductionWrite(
      new NextRequest("https://dydata.cc/api/admin/ai-config/check-dependencies", { method: "POST" }),
      cloudBaseProductionEnv,
    ),
    false,
  );
  assert.equal(
    shouldBlockDevProductionWrite(
      new NextRequest("https://dydata.cc/api/admin/ai-config/check-dependencies/other", { method: "POST" }),
      cloudBaseProductionEnv,
    ),
    true,
  );
});

test("线上环境和显式开发放行开关不拦截", () => {
  const request = new NextRequest("https://dydata.cc/api/videos", { method: "POST" });
  assert.equal(shouldBlockDevProductionWrite(request, { ...cloudBaseProductionEnv, NODE_ENV: "production" }), false);
  assert.equal(shouldBlockDevProductionWrite(request, { ...cloudBaseProductionEnv, DYDATA_DEV_ALLOW_PROD_WRITE: "1" }), false);
});

test("仅配置单一 CloudBase 正式环境 ID 时在开发模式下也会拦截写请求，隔离环境放行", () => {
  const writeRequest = new NextRequest("https://dydata.cc/api/videos", { method: "POST" });

  assert.equal(
    shouldBlockDevProductionWrite(writeRequest, {
      NODE_ENV: "development",
      NEXT_PUBLIC_CLOUDBASE_ENV_ID: cloudbaserc.envId,
    }),
    true,
  );
  assert.equal(
    shouldBlockDevProductionWrite(writeRequest, {
      NODE_ENV: "development",
      CLOUDBASE_ENV_ID: cloudbaserc.envId,
    }),
    true,
  );
  assert.equal(
    shouldBlockDevProductionWrite(writeRequest, {
      NODE_ENV: "development",
      CLOUDBASE_ENV_ID: "dydata-isolated-test",
      NEXT_PUBLIC_CLOUDBASE_ENV_ID: "dydata-isolated-test",
    }),
    false,
  );
});
