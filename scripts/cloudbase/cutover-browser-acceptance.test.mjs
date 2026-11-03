import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer as createHttpsServer } from "node:https";
import { connect as connectSocket } from "node:net";
import { spawnSync } from "node:child_process";

import {
  createSiteOnlyProxy,
  isAllowedOrigin,
  normalizeConfig,
  submissionGuardFailure,
  withProbeHeader,
  writePrivateEvidence,
} from "./cutover-browser-acceptance.mjs";
import { chromium } from "@playwright/test";

const domains = ["https://dydata.cc", "https://direct.dydata.cc"];
const sevenPages = (prefix) => Array.from({ length: 7 }, (_, index) => ({
  path: `${prefix}/page-${index + 1}`,
  outcome: "allow",
  expectedPath: `${prefix}/page-${index + 1}`,
  visibleText: `page marker ${index + 1}`,
}));

function validConfig(overrides = {}) {
  return {
    baseHost2domains: { "https://dydata.cc": domains },
    credentialsFile: "/private/credentials.json",
    probeTokenFile: "/private/probe-token",
    evidenceRoot: "/private/evidence",
    bizDate: "2026-11-03",
    accountId: "123e4567-e89b-42d3-a456-426614174000",
    pagesByRole: { member: sevenPages("/member"), admin: sevenPages("/admin") },
    ...overrides,
  };
}

test("配置要求两个受信本站域、双角色各七条显式页面验收和空日期前置值", () => {
  const normalized = normalizeConfig(validConfig());
  assert.deepEqual(normalized.origins, domains);
  assert.equal(normalized.pagesByRole.member.length, 7);
  assert.equal(normalized.pagesByRole.admin.length, 7);

  assert.throws(() => normalizeConfig(validConfig({ bizDate: undefined })), /bizDate/);
  assert.throws(() => normalizeConfig(validConfig({ accountId: undefined })), /accountId/);
  assert.throws(() => normalizeConfig(validConfig({
    baseHost2domains: { "https://dydata.cc": ["https://dydata.cc", "https://evil.example"] },
  })), /origin/);
  assert.throws(() => normalizeConfig(validConfig({
    pagesByRole: { member: sevenPages("/member").slice(0, 6), admin: sevenPages("/admin") },
  })), /seven|7/);
});

test("站点 origin 精确匹配，浏览器 probe header 不会自动附加到站外", () => {
  assert.equal(isAllowedOrigin("https://dydata.cc/dashboard", domains), true);
  assert.equal(isAllowedOrigin("https://direct.dydata.cc/login", domains), true);
  assert.equal(isAllowedOrigin("https://dydata.cc.evil.example/dashboard", domains), false);
  assert.equal(isAllowedOrigin("http://dydata.cc/dashboard", domains), false);

  assert.deepEqual(withProbeHeader({ accept: "text/html" }, "test-token"), {
    accept: "text/html",
    "x-dydata-cutover-probe": "test-token",
  });
});

test("作品提交防护只放行指定账号日期、异常作品、复盘分类和未选 topic_id", () => {
  const expected = {
    accountId: "123e4567-e89b-42d3-a456-426614174000",
    bizDate: "2026-11-03",
    title: "【验收-run-1】作品日报",
  };
  const payload = {
    account_id: expected.accountId,
    biz_date: expected.bizDate,
    video_title: expected.title,
    anomaly_status: "abnormal",
    topic_tag: "复盘",
    topic_id: null,
  };
  assert.equal(submissionGuardFailure(payload, expected), null);
  assert.equal(submissionGuardFailure({ ...payload, account_id: "other" }, expected), "account_id_mismatch");
  assert.equal(submissionGuardFailure({ ...payload, topic_id: "topic-id" }, expected), "topic_id_selected");
  assert.equal(submissionGuardFailure({ ...payload, anomaly_status: "normal" }, expected), "anomaly_status_mismatch");
  assert.equal(submissionGuardFailure({ ...payload, topic_tag: "干货" }, expected), "topic_tag_mismatch");
});

test("证据写入使用新私有目录及 600 文件权限", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "dydata-acceptance-test-"));
  try {
    const result = await writePrivateEvidence(tempRoot, "test-run", { safe: true });
    const directory = await stat(result.directory);
    const file = await stat(result.file);
    assert.equal(directory.mode & 0o777, 0o700);
    assert.equal(file.mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(result.file, "utf8")), { safe: true });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("真实浏览器经严格代理：本站跳转保留 probe，外域、IP、localhost 和明文请求均被阻断（仅本机 TLS）", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dydata-proxy-tls-test-"));
  const keyPath = path.join(directory, "key.pem"), certPath = path.join(directory, "cert.pem");
  const generated = spawnSync("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=local-proxy-test", "-keyout", keyPath, "-out", certPath], { stdio: "ignore" });
  assert.equal(generated.status, 0, "local test certificate generation must succeed");
  const token = "local-test-probe-token";
  const upstreamRequests = [], connectTargets = [];
  const server = createHttpsServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (request, response) => {
    const url = new URL(request.url, `https://${request.headers.host}`);
    upstreamRequests.push({ host: request.headers.host, path: url.pathname, token: request.headers["x-dydata-cutover-probe"] });
    if (url.pathname === "/start") {
      response.writeHead(302, { location: url.searchParams.get("to") });
      response.end();
      return;
    }
    response.writeHead(request.headers["x-dydata-cutover-probe"] === token ? 200 : 503, { "content-type": "text/html" });
    response.end("<main>Authorized final page</main>");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const proxy = await createSiteOnlyProxy({ connect(options) {
    assert.ok(["dydata.cc", "direct.dydata.cc"].includes(options.host));
    assert.equal(options.port, 443);
    connectTargets.push(options.host);
    // Every permitted authority resolves exclusively to this local TLS fixture.
    return connectSocket({ host: "127.0.0.1", port });
  } });
  const browser = await chromium.launch({ headless: true, proxy: { server: proxy.url }, args: ["--proxy-bypass-list=<-loopback>"] });
  try {
    for (const [label, destination] of [
      ["same origin", "https://dydata.cc/final"],
      ["second approved origin", "https://direct.dydata.cc/final"],
      ["external origin", "https://external.example/final"],
      ["lookalike host", "https://dydata.cc.external.example/final"],
      ["unapproved port", `https://dydata.cc:${port}/final`],
      ["literal IP", `https://127.0.0.1:${port}/final`],
      ["localhost", `https://localhost:${port}/final`],
      ["plaintext HTTP", "http://dydata.cc/final"],
    ]) {
      await t.test(label, async () => {
        const context = await browser.newContext({ serviceWorkers: "block", ignoreHTTPSErrors: true });
        const beforeRequests = upstreamRequests.length, beforeBlocked = proxy.blockedConnections;
        await context.route("**/*", async route => {
          if (!isAllowedOrigin(route.request().url(), domains)) { await route.abort("blockedbyclient"); return; }
          await route.continue({ headers: withProbeHeader(route.request().headers(), token) });
        });
        try {
          const page = await context.newPage();
          const start = `https://dydata.cc/start?to=${encodeURIComponent(destination)}`;
          if (label === "same origin" || label === "second approved origin") {
            const response = await page.goto(start, { timeout: 10000 });
            assert.equal(response.status(), 200);
            assert.equal(page.url(), destination);
            assert.equal(await page.locator("main").textContent(), "Authorized final page");
            assert.deepEqual(upstreamRequests.slice(beforeRequests).map(item => item.path), ["/start", "/final"]);
            assert.equal(upstreamRequests.at(-1).token, token, "the redirected request must still pass maintenance");
          } else {
            if (label === "plaintext HTTP") {
              const response = await page.goto(start, { timeout: 10000 });
              assert.equal(response.status(), 403);
            } else {
              await assert.rejects(page.goto(start, { timeout: 10000 }));
            }
            assert.ok(proxy.blockedConnections > beforeBlocked, "the proxy must reject the unapproved hop");
            assert.deepEqual(upstreamRequests.slice(beforeRequests).map(item => item.path), ["/start"]);
          }
        } finally {
          await context.close();
        }
      });
    }
  } finally {
    await browser.close();
    await proxy.close();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
  assert.ok(connectTargets.every(host => ["dydata.cc", "direct.dydata.cc"].includes(host)));
  assert.ok(upstreamRequests.every(item => domains.includes(`https://${item.host}`)));
});
