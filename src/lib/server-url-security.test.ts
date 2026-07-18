import test from "node:test";
import assert from "node:assert/strict";
import { Response as UndiciResponse } from "undici";

import {
  __internal,
  assertSafeExternalHttpsUrl,
  isPublicIpAddress,
  resolveSafeExternalHttpsTarget,
  withPinnedExternalResponse,
} from "./server-url-security";

test("AI 上游地址只允许 HTTPS 且不能携带账号密码", async () => {
  await assert.rejects(() => assertSafeExternalHttpsUrl("http://api.example.com/v1"), /HTTPS/);
  await assert.rejects(() => assertSafeExternalHttpsUrl("https://user:pass@api.example.com/v1"), /账号密码/);
});

test("拒绝本机、内网、链路本地和云元数据地址", async () => {
  const blocked = [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
  ];
  for (const address of blocked) assert.equal(isPublicIpAddress(address), false, address);

  await assert.rejects(() => assertSafeExternalHttpsUrl("https://localhost/v1"), /公网/);
  await assert.rejects(() => assertSafeExternalHttpsUrl("https://169.254.169.254/latest/meta-data"), /公网/);
});

test("域名解析到私网时也拒绝请求", async () => {
  await assert.rejects(
    () =>
      assertSafeExternalHttpsUrl("https://api.example.com/v1", async () => [
        { address: "10.0.0.8", family: 4 },
      ]),
    /公网/
  );
});

test("公网 HTTPS 地址通过校验", async () => {
  const normalized = await assertSafeExternalHttpsUrl("https://api.example.com/v1/", async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
  ]);

  assert.equal(normalized, "https://api.example.com/v1/");
});

test("任一解析地址落入私网时整次请求失败，不从混合结果中挑公网放行", async () => {
  await assert.rejects(
    () =>
      resolveSafeExternalHttpsTarget("https://api.example.com/v1", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ]),
    /公网/,
  );
});

test("固定 lookup 只返回已校验 IP，且拒绝连接阶段偷换 hostname", async () => {
  const target = await resolveSafeExternalHttpsTarget(
    "https://api.example.com/v1/chat/completions",
    async () => [{ address: "93.184.216.34", family: 4 }],
  );
  const pinnedLookup = __internal.createPinnedLookup(target);

  const resolved = await new Promise<{ address: string; family: number }>((resolve, reject) => {
    pinnedLookup("api.example.com", {}, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address: address as string, family: family as number });
    });
  });
  assert.deepEqual(resolved, { address: "93.184.216.34", family: 4 });

  await assert.rejects(
    () =>
      new Promise<void>((resolve, reject) => {
        pinnedLookup("metadata.google.internal", {}, (error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    /hostname changed/,
  );
});

test("真正外呼只解析一次、保留原 Host/SNI 域名，并在消费响应后关闭连接器", async () => {
  const events: string[] = [];
  let resolveCount = 0;
  let requestedUrl = "";
  let requestOptions: Record<string, unknown> | undefined;

  const result = await withPinnedExternalResponse(
    "https://api.example.com/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: "{}",
    },
    async (response) => {
      events.push("consume");
      return response.text();
    },
    {
      resolver: async () => {
        resolveCount += 1;
        return [{ address: "93.184.216.34", family: 4 }];
      },
      agentFactory: () =>
        ({
          close: async () => {
            events.push("close");
          },
        }) as never,
      fetchImpl: async (url, options) => {
        events.push("fetch");
        requestedUrl = String(url);
        requestOptions = options as unknown as Record<string, unknown>;
        return new UndiciResponse("ok");
      },
    },
  );

  assert.equal(result, "ok");
  assert.equal(resolveCount, 1);
  assert.equal(requestedUrl, "https://api.example.com/v1/chat/completions");
  assert.equal(requestOptions?.redirect, "manual");
  assert.ok(requestOptions?.dispatcher, "必须把固定 IP 的 dispatcher 传给真正 fetch");
  assert.deepEqual(events, ["fetch", "consume", "close"]);
});
