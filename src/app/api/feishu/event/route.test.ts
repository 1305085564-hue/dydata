import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import test from "node:test";

import { POST } from "./route";

const encryptKey = "feishu-route-test-encrypt-key";

function encryptEvent(body: Record<string, string>) {
  const iv = Buffer.alloc(16, 7);
  const cipher = createCipheriv(
    "aes-256-cbc",
    createHash("sha256").update(encryptKey).digest(),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(body), "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([iv, encrypted]).toString("base64");
}

test("回显未加密的飞书 URL 验证 challenge", async () => {
  const response = await POST(new Request("https://dydata.cc/api/feishu/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "url_verification", challenge: "plain-challenge" }),
  }));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), { challenge: "plain-challenge" });
});

test("回显加密的飞书 URL 验证 challenge", async () => {
  const previousKey = process.env.FEISHU_APP_ENCRYPT_KEY;
  process.env.FEISHU_APP_ENCRYPT_KEY = encryptKey;

  try {
    const response = await POST(new Request("https://dydata.cc/api/feishu/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        encrypt: encryptEvent({ type: "url_verification", challenge: "encrypted-challenge" }),
      }),
    }));

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.deepEqual(await response.json(), { challenge: "encrypted-challenge" });
  } finally {
    if (previousKey === undefined) delete process.env.FEISHU_APP_ENCRYPT_KEY;
    else process.env.FEISHU_APP_ENCRYPT_KEY = previousKey;
  }
});
