import test from "node:test";
import assert from "node:assert/strict";

import { assertSafeExternalHttpsUrl, isPublicIpAddress } from "./server-url-security";

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
