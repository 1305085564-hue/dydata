import test from "node:test";
import assert from "node:assert/strict";

import type { NextRequest } from "next/server";

import { getCronSecrets, getRequestSecret, isCronAuthorized } from "./cron-auth";

function createRequest(url: string) {
  return { url } as NextRequest;
}

test("同时兼容 CRON_SECRET 和 REMIND_SECRET", () => {
  process.env.CRON_SECRET = "cron-secret";
  process.env.REMIND_SECRET = "remind-secret";

  assert.deepEqual(getCronSecrets(), ["cron-secret", "remind-secret"]);
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/report?secret=cron-secret")), true);
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/report?secret=remind-secret")), true);
});

test("会忽略空白和重复密钥", () => {
  process.env.CRON_SECRET = " same-secret ";
  process.env.REMIND_SECRET = "same-secret";

  assert.deepEqual(getCronSecrets(), ["same-secret"]);
  assert.equal(getRequestSecret(createRequest("https://dydata.cc/api/report?secret=%20same-secret%20")), "same-secret");
});

test("缺少有效密钥或请求密钥不匹配时拒绝访问", () => {
  delete process.env.CRON_SECRET;
  delete process.env.REMIND_SECRET;
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/report?secret=anything")), false);

  process.env.CRON_SECRET = "cron-secret";
  delete process.env.REMIND_SECRET;
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/report?secret=wrong-secret")), false);
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/report")), false);
});
