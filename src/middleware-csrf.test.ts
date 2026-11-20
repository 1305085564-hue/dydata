import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";
import { isTrustedWrite } from "./lib/csrf";

// 现有中间件用例以 https://dydata.cc 为准；每个场景用例会自行覆盖并在结束时还原。
process.env.SITE_ORIGIN = "https://dydata.cc";

const SITE_ENV_KEYS = [
  "SITE_ORIGIN",
  "NEXT_PUBLIC_SITE_ORIGIN",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "APP_URL",
] as const;

async function withSite<T>(site: string | null, run: () => Promise<T> | T): Promise<T> {
  const saved = SITE_ENV_KEYS.map((key) => [key, process.env[key]] as const);
  for (const key of SITE_ENV_KEYS) delete process.env[key];
  if (site) process.env.SITE_ORIGIN = site;
  try {
    return await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

type Deployment = { name: string; site: string; requestBase: string };

/**
 * 两种部署形态分别跑同一张场景表：
 * - 腾讯云容器：站点地址是云托管临时域名，容器内 request.url 恒为 0.0.0.0:3000；
 * - Vercel：站点地址是正式域名，request.url 与公网一致。
 */
const DEPLOYMENTS: Deployment[] = [
  { name: "腾讯云容器", site: "https://dydata-mig-demo.sh.run.tcloudbase.com", requestBase: "http://0.0.0.0:3000" },
  { name: "Vercel", site: "https://dydata.cc", requestBase: "https://dydata.cc" },
];

type Case = {
  id: string;
  title: string;
  /** 覆盖站点配置；不填则用当前部署的站点地址。 */
  site?: string | null;
  build: (d: Deployment) => NextRequest;
  trusted: boolean;
};

const CASES: Case[] = [
  {
    id: "1",
    title: "同源写请求",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: d.site, "sec-fetch-site": "same-origin" },
    }),
    trusted: true,
  },
  {
    id: "2",
    title: "跨站写请求",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    }),
    trusted: false,
  },
  {
    id: "3",
    title: "同站不同子域（www → apex）",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: `https://www.${new URL(d.site).host}`, "sec-fetch-site": "same-site" },
    }),
    trusted: false,
  },
  {
    id: "4",
    title: "Sec-Fetch-Site: none + 外站 Origin",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "none" },
    }),
    trusted: false,
  },
  {
    id: "5",
    title: "无 Sec-Fetch-Site + 外站 Origin",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }),
    trusted: false,
  },
  {
    id: "6",
    title: "无 Origin 的服务端调用",
    build: (d) => new NextRequest(`${d.requestBase}/api/notifications/cleanup`, {
      method: "POST",
      headers: { authorization: "Bearer cron-secret" },
    }),
    trusted: true,
  },
  {
    id: "6a",
    title: "Sec-Fetch-Site: same-origin 但 Origin 是外站（改前放行）",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "same-origin" },
    }),
    trusted: false,
  },
  {
    id: "7",
    title: "Origin: null",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: "null" },
    }),
    trusted: false,
  },
  {
    id: "7a",
    title: "协议不同（http 同名主机，改前放行）",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: `http://${new URL(d.site).host}`, "sec-fetch-site": "same-origin" },
    }),
    trusted: false,
  },
  {
    id: "7b",
    title: "端口不同（:8443，改前放行）",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: `https://${new URL(d.site).hostname}:8443`, "sec-fetch-site": "same-origin" },
    }),
    trusted: false,
  },
  {
    id: "8",
    title: "容器内 request.url 为 0.0.0.0:3000，Origin 为配置站点",
    build: (d) => new NextRequest("http://0.0.0.0:3000/api/video-submit", {
      method: "POST",
      headers: { origin: d.site, "sec-fetch-site": "same-origin" },
    }),
    trusted: true,
  },
  {
    id: "9",
    title: "未配置站点地址 + 带 Origin（fail closed）",
    site: null,
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: { origin: d.site, "sec-fetch-site": "same-origin" },
    }),
    trusted: false,
  },
  {
    id: "10",
    title: "Host 与 X-Forwarded-Host 伪造为外站（改前放行）",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        "sec-fetch-site": "same-origin",
      },
    }),
    trusted: false,
  },
  {
    id: "11",
    title: "跨站 GET 不校验来源",
    build: (d) => new NextRequest(`${d.requestBase}/api/video-submit`, {
      method: "GET",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    }),
    trusted: true,
  },
  {
    id: "12",
    title: "飞书回调豁免路径",
    build: (d) => new NextRequest(`${d.requestBase}/api/feishu/event`, {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    }),
    trusted: true,
  },
];

for (const deployment of DEPLOYMENTS) {
  for (const scenario of CASES) {    test(`[${deployment.name}] ${scenario.id} ${scenario.title}`, async () => {
      await withSite(scenario.site === undefined ? deployment.site : scenario.site, () => {
        assert.equal(isTrustedWrite(scenario.build(deployment)), scenario.trusted);
      });
    });
  }

  test(`[${deployment.name}] 13 非法 UUID 路径参数在进入路由前被拒绝`, async () => {
    await withSite(deployment.site, async () => {
      const response = await middleware(
        new NextRequest(`${deployment.requestBase}/api/notifications/not-an-id/read`, { method: "PATCH" }),
      );
      assert.equal(response.status, 400);
    });
  });

  // 接线校验：确认中间件真的调用了单一判定函数，而不是只测纯函数。
  test(`[${deployment.name}] 中间件接线：外站 Origin 返回 403`, async () => {
    await withSite(deployment.site, async () => {
      const response = await middleware(
        new NextRequest(`${deployment.requestBase}/api/video-submit`, {
          method: "POST",
          headers: { origin: "https://evil.example", "sec-fetch-site": "same-origin" },
        }),
      );
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "请求来源不可信" });
    });
  });
}

test("API 路由纳入 middleware 匹配范围", async () => {
  const { config } = await import("./middleware");
  assert.ok(config.matcher.includes("/api/:path*"));
});
