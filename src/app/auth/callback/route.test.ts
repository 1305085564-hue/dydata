import test from "node:test";
import assert from "node:assert/strict";

import { GET } from "./route";

function createRequest(url: string) {
  return new Request(url);
}

test("auth callback 缺少 code 和 token_hash 时回登录页 expired", async () => {
  const response = await GET(createRequest("https://dydata.cc/auth/callback?next=/reset-password"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://dydata.cc/login?reset=expired");
});

